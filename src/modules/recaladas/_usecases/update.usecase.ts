import type { Request } from "express"
import type { Prisma } from "@prisma/client"

import { BadRequestError, ConflictError, NotFoundError } from "../../../libs/errors"
import { logger } from "../../../libs/logger"

import { recaladaRepository } from "../_data/recalada.repository"
import { buildUpdateData } from "../_domain/recalada.rules"
import type { UpdateRecaladaInput } from "../_domain/recalada.types"
import { auditFail, auditOk } from "../_shared/recalada.audit"
import { recaladaCache, toCachedRecalada } from "../_shared/recalada.cache"
import { emitRecaladaRealtime } from "../../../core/socket/domain-events"

export async function updateRecaladaUsecase(
  req: Request,
  id: number,
  input: UpdateRecaladaInput,
  actorUserId: string,
) {
  const current = await recaladaRepository.findByIdForUpdate(id)

  if (!current) {
    auditFail(
      req,
      "recaladas.update.failed",
      "Update recalada failed",
      { reason: "not_found", recaladaId: id },
      { entity: "Recalada", id: String(id) },
    )
    throw new NotFoundError("La recalada no existe")
  }

  if (current.operationalStatus === "DEPARTED" || current.operationalStatus === "CANCELED") {
    auditFail(
      req,
      "recaladas.update.failed",
      "Update recalada failed",
      {
        reason: "invalid_operational_status",
        operationalStatus: current.operationalStatus,
        recaladaId: id,
      },
      { entity: "Recalada", id: String(id) },
    )
    throw new BadRequestError(
      "No se puede editar una recalada en estado DEPARTED o CANCELED",
    )
  }

  let built: { data: Prisma.RecaladaUpdateInput; updatedKeys: string[] }

  try {
    built = buildUpdateData({
      current: {
        operationalStatus: current.operationalStatus,
        fechaLlegada: current.fechaLlegada,
        fechaSalida: current.fechaSalida,
      },
      input: input as unknown as Record<string, any>,
    })
  } catch (err: any) {
    const msg = String(err?.message ?? "")

    auditFail(
      req,
      "recaladas.update.failed",
      "Update recalada failed",
      {
        reason:
          msg.includes("No hay campos permitidos")
            ? "no_allowed_fields"
            : msg.includes("fechaSalida")
              ? "fechaSalida_lt_fechaLlegada"
              : "bad_request",
        operationalStatus: current.operationalStatus,
        recaladaId: id,
        message: msg,
      },
      { entity: "Recalada", id: String(id) },
    )

    throw err
  }

  const data = built.data

  // Validar FK si cambian
  const nextBuqueId = (data as any).buqueId as number | undefined
  if (typeof nextBuqueId === "number") {
    const buque = await recaladaRepository.findBuqueById(nextBuqueId)
    if (!buque) {
      auditFail(
        req,
        "recaladas.update.failed",
        "Update recalada failed",
        { reason: "buque_not_found", buqueId: nextBuqueId, recaladaId: id },
        { entity: "Recalada", id: String(id) },
      )
      throw new NotFoundError("El buque (buqueId) no existe")
    }
  }

  const nextPaisOrigenId = (data as any).paisOrigenId as number | undefined
  if (typeof nextPaisOrigenId === "number") {
    const pais = await recaladaRepository.findPaisById(nextPaisOrigenId)
    if (!pais) {
      auditFail(
        req,
        "recaladas.update.failed",
        "Update recalada failed",
        {
          reason: "paisOrigen_not_found",
          paisOrigenId: nextPaisOrigenId,
          recaladaId: id,
        },
        { entity: "Recalada", id: String(id) },
      )
      throw new NotFoundError("El país (paisOrigenId) no existe")
    }
  }

  const nextPuertoId = (data as any).puertoId as number | null | undefined
  const nextMuelleId = (data as any).muelleId as number | null | undefined

  if (typeof nextPuertoId === "number") {
    const puerto = await recaladaRepository.findPuertoById(nextPuertoId)
    if (!puerto) {
      auditFail(
        req,
        "recaladas.update.failed",
        "Update recalada failed",
        { reason: "puerto_not_found", puertoId: nextPuertoId, recaladaId: id },
        { entity: "Recalada", id: String(id) },
      )
      throw new NotFoundError("El puerto (puertoId) no existe")
    }
  }

  if (typeof nextMuelleId === "number") {
    const muelle = await recaladaRepository.findMuelleById(nextMuelleId)
    if (!muelle) {
      auditFail(
        req,
        "recaladas.update.failed",
        "Update recalada failed",
        { reason: "muelle_not_found", muelleId: nextMuelleId, recaladaId: id },
        { entity: "Recalada", id: String(id) },
      )
      throw new NotFoundError("El muelle (muelleId) no existe")
    }

    if (typeof nextPuertoId === "number" && muelle.puertoId !== nextPuertoId) {
      auditFail(
        req,
        "recaladas.update.failed",
        "Update recalada failed",
        {
          reason: "muelle_puerto_mismatch",
          puertoId: nextPuertoId,
          muelleId: nextMuelleId,
          muellePuertoId: muelle.puertoId,
          recaladaId: id,
        },
        { entity: "Recalada", id: String(id) },
      )
      throw new ConflictError("El muelle informado no pertenece al puerto informado")
    }

    if (typeof nextPuertoId === "undefined") {
      ;(data as any).puertoId = muelle.puertoId
      built.updatedKeys = Array.from(new Set([...built.updatedKeys, "puertoId"]))
    }
  }

  if (typeof nextPuertoId === "number" && typeof nextMuelleId === "undefined" && current.muelleId) {
    ;(data as any).muelleId = null
    built.updatedKeys = Array.from(new Set([...built.updatedKeys, "muelleId"]))
  }

  // Validar slot si viene en el update
  const nextSlotId = (input as any).slotId as number | null | undefined
  const nextSlotNumero = (input as any).slotNumero as number | undefined

  let resolvedUpdateSlotId: number | null | undefined = nextSlotId
  if (resolvedUpdateSlotId === undefined && nextSlotNumero) {
    const slotByNumero = await recaladaRepository.findSlotByNumero(nextSlotNumero)
    if (!slotByNumero) throw new NotFoundError(`El slot número ${nextSlotNumero} no existe`)
    resolvedUpdateSlotId = slotByNumero.id
  }
  if (resolvedUpdateSlotId !== undefined) {
    if (resolvedUpdateSlotId !== null) {
      const slotDb = await recaladaRepository.findSlotById(resolvedUpdateSlotId)
      if (!slotDb) throw new NotFoundError("El slot operativo (slotId) no existe")
      if (slotDb.status !== "ACTIVO") {
        throw new ConflictError(
          `El slot ${slotDb.numero} está inactivo${slotDb.motivoInactividad ? `: ${slotDb.motivoInactividad}` : ""}`,
        )
      }
    }
    ;(data as any).slotId = resolvedUpdateSlotId
    built.updatedKeys = Array.from(new Set([...built.updatedKeys, "slotId"]))
  }

  // Revalidar solapamiento de buque si cambian buque o fechas
  const effectiveBuqueId = typeof nextBuqueId === "number" ? nextBuqueId : current.buqueId
  const effectiveFechaLlegada = (data.fechaLlegada as Date | undefined) ?? current.fechaLlegada
  const effectiveFechaSalida = (data.fechaSalida as Date | null | undefined) ?? current.fechaSalida
  const buqueOrDatesChanged =
    typeof nextBuqueId === "number" ||
    (data.fechaLlegada !== undefined) ||
    (data.fechaSalida !== undefined)

  if (buqueOrDatesChanged) {
    const overlap = await recaladaRepository.findOverlappingForBuque({
      buqueId: effectiveBuqueId,
      fechaLlegada: effectiveFechaLlegada,
      fechaSalida: effectiveFechaSalida,
      excludeId: id,
    })

    if (overlap) {
      auditFail(
        req,
        "recaladas.update.failed",
        "Update recalada failed",
        {
          reason: "buque_overlap",
          buqueId: effectiveBuqueId,
          existingRecaladaId: overlap.id,
          existingCodigo: overlap.codigoRecalada,
          recaladaId: id,
        },
        { entity: "Recalada", id: String(id) },
      )
      throw new ConflictError(
        `El buque ya tiene una recalada activa en ese período (${overlap.codigoRecalada}). Ajusta las fechas.`,
      )
    }

    const outsideAtencion = await recaladaRepository.findAtencionOutsideWindow({
      recaladaId: id,
      fechaLlegada: effectiveFechaLlegada,
      fechaSalida: effectiveFechaSalida,
    })

    if (outsideAtencion) {
      auditFail(
        req,
        "recaladas.update.failed",
        "Update recalada failed",
        {
          reason: "atencion_outside_new_window",
          recaladaId: id,
          atencionId: outsideAtencion.id,
          fechaLlegada: effectiveFechaLlegada.toISOString(),
          fechaSalida: effectiveFechaSalida?.toISOString() ?? null,
        },
        { entity: "Recalada", id: String(id) },
      )
      throw new ConflictError(
        `No se puede cambiar la ventana de la recalada: la atención ${outsideAtencion.id} quedaría fuera del nuevo rango.`,
      )
    }
  }

  const updated = await recaladaRepository.update(id, data)

  logger.info(
    {
      recaladaId: id,
      actorUserId,
      operationalStatus: current.operationalStatus,
      updatedKeys: built.updatedKeys,
    },
    "[Recaladas] update",
  )

  auditOk(
    req,
    "recaladas.update.success",
    "Recalada updated",
    {
      actorUserId,
      recaladaId: id,
      operationalStatusBefore: current.operationalStatus,
      updatedKeys: built.updatedKeys,
    },
    { entity: "Recalada", id: String(id) },
  )

  recaladaCache.set(toCachedRecalada(updated))

  emitRecaladaRealtime("recalada:updated", {
    recaladaId: id,
    status: updated.status,
    operationalStatus: updated.operationalStatus,
  })

  return updated
}
