import type { Request } from "express"
import type {
  RecaladaOperativeStatus,
  RecaladaSource,
  StatusType,
} from "@prisma/client"

import { ConflictError, NotFoundError } from "../../../libs/errors"
import { logger } from "../../../libs/logger"

import { recaladaRepository } from "../_data/recalada.repository"
import {
  assertFechaSalidaGteFechaLlegada,
  assertManualFechaSalidaNotPast,
  assertPasajerosEstimadosMin1,
} from "../_domain/recalada.rules"
import type { CreateRecaladaInput } from "../_domain/recalada.types"
import { auditFail, auditOk } from "../_shared/recalada.audit"
import { recaladaCache, toCachedRecalada } from "../_shared/recalada.cache"
import { emitRecaladaRealtime } from "../../../core/socket/domain-events"
import { socketService } from "../../../core/socket/socket.service"
import { enqueueRecaladaCreatedNotification } from "../../notifications/notification.service"

export async function createRecaladaUsecase(
  req: Request,
  input: CreateRecaladaInput,
  actorUserId: string,
) {
  // Regla base: fechaSalida >= fechaLlegada
  if (input.fechaSalida) {
    try {
      assertFechaSalidaGteFechaLlegada(input.fechaLlegada, input.fechaSalida)
    } catch (err) {
      auditFail(
        req,
        "recaladas.create.failed",
        "Create recalada failed",
        {
          reason: "fechaSalida_lt_fechaLlegada",
          fechaLlegada: input.fechaLlegada?.toISOString?.(),
          fechaSalida: input.fechaSalida?.toISOString?.(),
        },
        { entity: "Recalada" },
      )
      throw err
    }
  }

  // PR-01: reglas “duras” operativas
  const now = new Date()
  const source: RecaladaSource = input.fuente ?? "MANUAL"

  if (input.fechaSalida) {
    try {
      assertManualFechaSalidaNotPast(source, input.fechaSalida, now)
    } catch (err) {
      auditFail(
        req,
        "recaladas.create.failed",
        "Create recalada failed",
        {
          reason: "manual_fechaSalida_past",
          fuente: source,
          fechaSalida: input.fechaSalida?.toISOString?.(),
          now: now.toISOString(),
        },
        { entity: "Recalada" },
      )
      throw err
    }
  }

  if (typeof input.pasajerosEstimados !== "undefined" && input.pasajerosEstimados !== null) {
    if (input.pasajerosEstimados < 1) {
      auditFail(
        req,
        "recaladas.create.failed",
        "Create recalada failed",
        {
          reason: "pasajerosEstimados_lt_1",
          pasajerosEstimados: input.pasajerosEstimados,
        },
        { entity: "Recalada" },
      )
      assertPasajerosEstimadosMin1(input.pasajerosEstimados)
    }
  }

  // Resolver slotId desde slotNumero si no viene slotId directo
  let resolvedSlotId: number | null = input.slotId ?? null
  if (!resolvedSlotId && input.slotNumero) {
    const slotByNumero = await recaladaRepository.findSlotByNumero(input.slotNumero)
    if (!slotByNumero) {
      auditFail(req, "recaladas.create.failed", "Create recalada failed",
        { reason: "slot_not_found", slotNumero: input.slotNumero }, { entity: "Recalada" })
      throw new NotFoundError(`El slot número ${input.slotNumero} no existe`)
    }
    resolvedSlotId = slotByNumero.id
  }

  const [buque, pais, puerto, muelle, slotDb, overlap] = await Promise.all([
    recaladaRepository.findBuqueById(input.buqueId),
    recaladaRepository.findPaisById(input.paisOrigenId),
    input.puertoId ? recaladaRepository.findPuertoById(input.puertoId) : Promise.resolve(null),
    input.muelleId ? recaladaRepository.findMuelleById(input.muelleId) : Promise.resolve(null),
    resolvedSlotId ? recaladaRepository.findSlotById(resolvedSlotId) : Promise.resolve(null),
    recaladaRepository.findOverlappingForBuque({
      buqueId: input.buqueId,
      fechaLlegada: input.fechaLlegada,
      fechaSalida: input.fechaSalida,
    }),
  ])

  if (overlap) {
    auditFail(
      req,
      "recaladas.create.failed",
      "Create recalada failed",
      {
        reason: "buque_overlap",
        buqueId: input.buqueId,
        existingRecaladaId: overlap.id,
        existingCodigo: overlap.codigoRecalada,
      },
      { entity: "Recalada" },
    )
    throw new ConflictError(
      `El buque ya tiene una recalada activa en ese período (${overlap.codigoRecalada}). Cancélala o ajusta las fechas.`,
    )
  }

  if (!buque) {
    auditFail(
      req,
      "recaladas.create.failed",
      "Create recalada failed",
      { reason: "buque_not_found", buqueId: input.buqueId },
      { entity: "Recalada" },
    )
    throw new NotFoundError("El buque (buqueId) no existe")
  }

  if (!pais) {
    auditFail(
      req,
      "recaladas.create.failed",
      "Create recalada failed",
      { reason: "paisOrigen_not_found", paisOrigenId: input.paisOrigenId },
      { entity: "Recalada" },
    )
    throw new NotFoundError("El país (paisOrigenId) no existe")
  }

  if (input.puertoId && !puerto) {
    auditFail(
      req,
      "recaladas.create.failed",
      "Create recalada failed",
      { reason: "puerto_not_found", puertoId: input.puertoId },
      { entity: "Recalada" },
    )
    throw new NotFoundError("El puerto (puertoId) no existe")
  }

  if (input.muelleId && !muelle) {
    auditFail(
      req,
      "recaladas.create.failed",
      "Create recalada failed",
      { reason: "muelle_not_found", muelleId: input.muelleId },
      { entity: "Recalada" },
    )
    throw new NotFoundError("El muelle (muelleId) no existe")
  }

  if (resolvedSlotId && !slotDb) {
    auditFail(req, "recaladas.create.failed", "Create recalada failed",
      { reason: "slot_not_found", slotId: resolvedSlotId }, { entity: "Recalada" })
    throw new NotFoundError("El slot operativo (slotId) no existe")
  }

  if (slotDb && slotDb.status !== "ACTIVO") {
    auditFail(req, "recaladas.create.failed", "Create recalada failed",
      { reason: "slot_inactive", slotId: slotDb.id, numero: slotDb.numero }, { entity: "Recalada" })
    throw new ConflictError(
      `El slot ${slotDb.numero} está inactivo${slotDb.motivoInactividad ? `: ${slotDb.motivoInactividad}` : ""}`,
    )
  }

  const resolvedPuertoId = input.puertoId ?? muelle?.puertoId ?? null
  if (input.puertoId && muelle && muelle.puertoId !== input.puertoId) {
    auditFail(
      req,
      "recaladas.create.failed",
      "Create recalada failed",
      {
        reason: "muelle_puerto_mismatch",
        puertoId: input.puertoId,
        muelleId: input.muelleId,
        muellePuertoId: muelle.puertoId,
      },
      { entity: "Recalada" },
    )
    throw new ConflictError("El muelle informado no pertenece al puerto informado")
  }

  let supervisor = await recaladaRepository.findSupervisorByUserId(actorUserId)

  if (!supervisor) {
    logger.warn(
      { actorUserId },
      "[Recaladas] supervisor not found for user; creating one",
    )

    // audit info porque es side-effect relevante
    auditOk(
      req,
      "recaladas.supervisor.autocreate",
      "Supervisor auto-created for actor",
      { actorUserId },
      { entity: "Supervisor" },
    )

    supervisor = await recaladaRepository.createSupervisorForUser(actorUserId)
  }

  const status: StatusType = input.status ?? "ACTIVO"

  // Estado operativo inicial: si la fecha de llegada ya pasó (o es ahora), la
  // recalada nace como ARRIVED con arrivedAt = ahora. Si es futura, queda SCHEDULED.
  // La regla de fechaSalida vencida ya fue rechazada por las validaciones previas
  // para fuente MANUAL.
  const operationalStatus: RecaladaOperativeStatus =
    input.fechaLlegada.getTime() <= now.getTime() ? "ARRIVED" : "SCHEDULED"
  const arrivedAt = operationalStatus === "ARRIVED" ? now : null

  const created = await recaladaRepository.createWithCodigoAtomic({
    input: {
      ...input,
      puertoId: resolvedPuertoId,
      muelleId: input.muelleId ?? null,
      slotId: resolvedSlotId,
    } as any,
    supervisorId: supervisor.id,
    source,
    status,
    operationalStatus,
    arrivedAt,
  })

  logger.info(
    {
      recaladaId: created.id,
      codigoRecalada: created.codigoRecalada,
      actorUserId,
    },
    "[Recaladas] created",
  )

  auditOk(
    req,
    "recaladas.create.success",
    "Recalada created",
    {
      actorUserId,
      buqueId: created.buque?.id ?? input.buqueId,
      paisOrigenId: created.paisOrigen?.id ?? input.paisOrigenId,
      puertoId: created.puertoId,
      muelleId: created.muelleId,
      operationalStatus: created.operationalStatus,
      status: created.status,
      fechaLlegada: created.fechaLlegada?.toISOString?.(),
      fechaSalida: created.fechaSalida?.toISOString?.() ?? null,
      fuente: created.fuente,
      terminal: created.terminal,
      muelle: created.muelle,
    },
    { entity: "Recalada", id: String(created.id) },
  )

  recaladaCache.set(toCachedRecalada(created))

  emitRecaladaRealtime("recalada:created", {
    recaladaId: created.id,
    status: created.status,
    operationalStatus: created.operationalStatus,
  })

  const notificationId = `recalada:${created.id}:created`
  socketService.emitToAllGuias("recalada:nueva", {
    notificationId,
    recaladaId: created.id,
    codigoRecalada: created.codigoRecalada,
    fechaLlegada: created.fechaLlegada,
    fechaSalida: created.fechaSalida,
    terminal: created.terminal,
    muelle: created.muelle,
    buque: created.buque ?? null,
    paisOrigen: created.paisOrigen ?? null,
  })

  enqueueRecaladaCreatedNotification(created.id).catch((err) => {
    logger.error(
      {
        err,
        recaladaId: created.id,
        notificationId,
      },
      "[Recaladas] failed to enqueue created notification",
    )
  })

  return created
}
