import type { Request } from "express"

import { logger } from "../../../libs/logger"
import { ConflictError, NotFoundError } from "../../../libs/errors"

import { atencionRepository } from "../_data/atencion.repository"
import { auditFail, auditOk } from "../_shared/atencion.audit"
import { atencionCapacityCache } from "../_shared/atencion-capacity.cache"
import { emitAtencionRealtime } from "../../../core/socket/domain-events"
import type { AtencionEvaluationBody } from "../atencion.schemas"

export async function closeAtencionUsecase(
  req: Request,
  id: number,
  actorUserId: string,
  evaluation?: AtencionEvaluationBody,
) {
  const gate = await atencionRepository.findGateForClose(id)

  if (!gate) {
    auditFail(
      req,
      "atenciones.close.failed",
      "Close atencion failed",
      { reason: "not_found", atencionId: id },
      { entity: "Atencion", id: String(id) },
    )
    throw new NotFoundError("Atención no encontrada")
  }

  if (gate.operationalStatus === "CLOSED") {
    auditOk(
      req,
      "atenciones.close.noop",
      "Close atencion noop (already closed)",
      { atencionId: id },
      { entity: "Atencion", id: String(id) },
    )

    atencionCapacityCache.invalidate(id)

    if (evaluation) {
      await atencionRepository.upsertEvaluation({
        atencionId: id,
        calificacion: evaluation.calificacion,
        estadoFinal: evaluation.estadoFinal,
        observaciones: evaluation.observaciones,
        evaluatedById: actorUserId,
        evaluatedAt: new Date(),
      })
    }

    const item = await atencionRepository.findById(id)
    if (!item) throw new NotFoundError("Atención no encontrada")
    return item
  }

  if (gate.operationalStatus === "CANCELED") {
    auditFail(
      req,
      "atenciones.close.failed",
      "Close atencion failed",
      { reason: "already_canceled", atencionId: id },
      { entity: "Atencion", id: String(id) },
    )
    throw new ConflictError("No se puede cerrar una atención cancelada")
  }

  if (gate.recalada.operationalStatus === "CANCELED") {
    auditFail(
      req,
      "atenciones.close.failed",
      "Close atencion failed",
      { reason: "recalada_canceled", recaladaId: gate.recalada.id },
      { entity: "Recalada", id: String(gate.recalada.id) },
    )
    throw new ConflictError("No se puede cerrar: la recalada está cancelada")
  }

  if (gate.recalada.operationalStatus === "DEPARTED") {
    auditFail(
      req,
      "atenciones.close.failed",
      "Close atencion failed",
      { reason: "recalada_departed", recaladaId: gate.recalada.id },
      { entity: "Recalada", id: String(gate.recalada.id) },
    )
    throw new ConflictError(
      "No se puede cerrar: la recalada ya finalizó (DEPARTED)",
    )
  }

  const aliveCount = await atencionRepository.countTurnosAlive(id)
  if (aliveCount > 0) {
    auditFail(
      req,
      "atenciones.close.failed",
      "Close atencion failed",
      { reason: "turnos_alive", atencionId: id, aliveCount },
      { entity: "Atencion", id: String(id) },
    )
    throw new ConflictError(
      "No se puede cerrar la atención: aún existen turnos AVAILABLE/ASSIGNED/IN_PROGRESS",
    )
  }

  const updated = evaluation
    ? await atencionRepository.closeAtencionWithEvaluation({
        id,
        evaluation,
        actorUserId,
        evaluatedAt: new Date(),
      })
    : await atencionRepository.closeAtencion({ id })

  if (!updated) throw new NotFoundError("Atención no encontrada")

  logger.info({ atencionId: id, actorUserId }, "[Atenciones] closed")

  auditOk(
    req,
    "atenciones.close.success",
    "Atencion closed",
    {
      atencionId: id,
      recaladaId: updated.recaladaId,
      actorUserId,
      evaluated: !!evaluation,
    },
    { entity: "Atencion", id: String(id) },
  )

  atencionCapacityCache.invalidate(id)

  emitAtencionRealtime("atencion:closed", {
    atencionId: id,
    recaladaId: updated.recaladaId,
    status: updated.status,
    operationalStatus: updated.operationalStatus,
  })

  return updated
}
