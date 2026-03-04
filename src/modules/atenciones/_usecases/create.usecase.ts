import type { Request } from "express"

import { logger } from "../../../libs/logger"
import { BadRequestError, ConflictError, NotFoundError } from "../../../libs/errors"

import type { CreateAtencionBody } from "../atencion.schemas"

import { atencionRepository } from "../_data/atencion.repository"
import {
  assertTurnosTotalValid,
  assertWindowDatesValid,
  assertWindowNotPast,
  assertRecaladaOperable,
  assertWindowWithinRecalada,
} from "../_domain/atencion.rules"
import { auditFail, auditOk } from "../_shared/atencion.audit"

export async function createAtencionUsecase(
  req: Request,
  input: CreateAtencionBody,
  actorUserId: string,
) {
  // Reglas básicas de ventana
  try {
    assertWindowDatesValid(input.fechaInicio, input.fechaFin)
  } catch (e: any) {
    auditFail(
      req,
      "atenciones.create.failed",
      "Create atencion failed",
      {
        reason: "fechaFin_lt_fechaInicio",
        fechaInicio: input.fechaInicio?.toISOString?.(),
        fechaFin: input.fechaFin?.toISOString?.(),
      },
      { entity: "Atencion" },
    )
    throw e
  }

  // total_turnos >= 1
  try {
    assertTurnosTotalValid(input.turnosTotal)
  } catch (e: any) {
    auditFail(
      req,
      "atenciones.create.failed",
      "Create atencion failed",
      { reason: "turnosTotal_invalid", turnosTotal: input.turnosTotal },
      { entity: "Atencion" },
    )
    throw e
  }

  const now = new Date()

  // Traer recalada
  const recalada = await atencionRepository.findRecaladaByIdForAtencion(input.recaladaId)

  if (!recalada) {
    auditFail(
      req,
      "atenciones.create.failed",
      "Create atencion failed",
      { reason: "recalada_not_found", recaladaId: input.recaladaId },
      { entity: "Recalada", id: String(input.recaladaId) },
    )
    throw new NotFoundError("La recalada (recaladaId) no existe")
  }

  // recalada operable
  try {
    assertRecaladaOperable({
      recalada: {
        id: recalada.id,
        status: recalada.status,
        operationalStatus: recalada.operationalStatus,
        fechaSalida: recalada.fechaSalida,
      },
      now,
      actionLabel: "crear",
    })
  } catch (e: any) {
    auditFail(
      req,
      "atenciones.create.failed",
      "Create atencion failed",
      {
        reason: "recalada_not_operable",
        recaladaId: recalada.id,
        status: recalada.status,
        operationalStatus: recalada.operationalStatus,
        fechaSalida: recalada.fechaSalida?.toISOString?.() ?? null,
      },
      { entity: "Recalada", id: String(recalada.id) },
    )
    throw e
  }

  // ventana dentro de recalada
  try {
    assertWindowWithinRecalada({
      fechaInicio: input.fechaInicio,
      fechaFin: input.fechaFin,
      recalada: { fechaLlegada: recalada.fechaLlegada, fechaSalida: recalada.fechaSalida },
    })
  } catch (e: any) {
    auditFail(
      req,
      "atenciones.create.failed",
      "Create atencion failed",
      {
        reason: "window_outside_recalada",
        recaladaId: recalada.id,
        fechaLlegada: recalada.fechaLlegada.toISOString(),
        fechaSalida: recalada.fechaSalida?.toISOString?.() ?? null,
        fechaInicio: input.fechaInicio.toISOString(),
        fechaFin: input.fechaFin.toISOString(),
      },
      { entity: "Recalada", id: String(recalada.id) },
    )
    throw e
  }

  // contra “ahora”
  try {
    assertWindowNotPast(input.fechaInicio, input.fechaFin, now)
  } catch (e: any) {
    auditFail(
      req,
      "atenciones.create.failed",
      "Create atencion failed",
      {
        reason: "window_past",
        now: now.toISOString(),
        fechaInicio: input.fechaInicio.toISOString(),
        fechaFin: input.fechaFin.toISOString(),
      },
      { entity: "Atencion" },
    )
    throw e
  }

  // overlap
  const overlap = await atencionRepository.findOverlapActive({
    recaladaId: input.recaladaId,
    fechaInicio: input.fechaInicio,
    fechaFin: input.fechaFin,
  })

  if (overlap) {
    auditFail(
      req,
      "atenciones.create.failed",
      "Create atencion failed",
      {
        reason: "overlap",
        recaladaId: input.recaladaId,
        overlapAtencionId: overlap.id,
        overlapFechaInicio: overlap.fechaInicio.toISOString(),
        overlapFechaFin: overlap.fechaFin.toISOString(),
      },
      { entity: "Recalada", id: String(input.recaladaId) },
    )
    throw new ConflictError(
      "La ventana de la atención se solapa con otra atención existente en esta recalada",
    )
  }

  // resolver supervisorId
  let supervisor = await atencionRepository.findSupervisorByUserId(actorUserId)

  if (!supervisor) {
    logger.warn(
      { actorUserId },
      "[Atenciones] supervisor not found for user; creating one",
    )

    auditOk(
      req,
      "atenciones.supervisor.autocreate",
      "Supervisor auto-created for actor",
      { actorUserId },
      { entity: "Supervisor" },
    )

    supervisor = await atencionRepository.createSupervisorForUser(actorUserId)
  }

  const created = await atencionRepository.createWithTurnosAtomic({
    recaladaId: input.recaladaId,
    supervisorId: supervisor.id,
    turnosTotal: input.turnosTotal,
    descripcion: input.descripcion ?? null,
    fechaInicio: input.fechaInicio,
    fechaFin: input.fechaFin,
    actorUserId,
  })

  if (!created) {
    auditFail(
      req,
      "atenciones.create.failed",
      "Create atencion failed",
      { reason: "transaction_returned_null", recaladaId: input.recaladaId },
      { entity: "Atencion" },
    )
    throw new BadRequestError("No fue posible crear la atención")
  }

  logger.info(
    { atencionId: created.id, recaladaId: created.recaladaId, actorUserId },
    "[Atenciones] created",
  )

  auditOk(
    req,
    "atenciones.create.success",
    "Atencion created",
    {
      atencionId: created.id,
      recaladaId: created.recaladaId,
      codigoRecalada: created.recalada?.codigoRecalada ?? recalada.codigoRecalada,
      turnosTotal: created.turnosTotal,
      fechaInicio: created.fechaInicio?.toISOString?.(),
      fechaFin: created.fechaFin?.toISOString?.(),
      supervisorId: created.supervisorId,
    },
    { entity: "Atencion", id: String(created.id) },
  )

  return created
}