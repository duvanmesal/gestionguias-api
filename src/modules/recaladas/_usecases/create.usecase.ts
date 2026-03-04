import type { Request } from "express"
import type { RecaladaSource, StatusType } from "@prisma/client"

import { NotFoundError } from "../../../libs/errors"
import { logger } from "../../../libs/logger"

import { recaladaRepository } from "../_data/recalada.repository"
import {
  assertFechaSalidaGteFechaLlegada,
  assertManualFechaSalidaNotPast,
  assertPasajerosEstimadosMin1,
} from "../_domain/recalada.rules"
import type { CreateRecaladaInput } from "../_domain/recalada.types"
import { auditFail, auditOk } from "../_shared/recalada.audit"

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

  const [buque, pais] = await Promise.all([
    recaladaRepository.findBuqueById(input.buqueId),
    recaladaRepository.findPaisById(input.paisOrigenId),
  ])

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

  const created = await recaladaRepository.createWithCodigoAtomic({
    input,
    supervisorId: supervisor.id,
    source,
    status,
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

  return created
}