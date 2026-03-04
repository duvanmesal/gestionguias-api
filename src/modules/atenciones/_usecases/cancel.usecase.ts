import type { Request } from "express"

import { logger } from "../../../libs/logger"
import { ConflictError, NotFoundError } from "../../../libs/errors"

import { atencionRepository } from "../_data/atencion.repository"
import { auditFail, auditOk } from "../_shared/atencion.audit"

export async function cancelAtencionUsecase(
  req: Request,
  id: number,
  reason: string,
  actorUserId: string,
) {
  const gate = await atencionRepository.findGateForCancel(id)

  if (!gate) {
    auditFail(
      req,
      "atenciones.cancel.failed",
      "Cancel atencion failed",
      { reason: "not_found", atencionId: id },
      { entity: "Atencion", id: String(id) },
    )
    throw new NotFoundError("Atención no encontrada")
  }

  if (gate.operationalStatus === "CANCELED") {
    auditOk(
      req,
      "atenciones.cancel.noop",
      "Cancel atencion noop (already canceled)",
      { atencionId: id },
      { entity: "Atencion", id: String(id) },
    )

    const item = await atencionRepository.findById(id)
    if (!item) throw new NotFoundError("Atención no encontrada")
    return item
  }

  if (gate.operationalStatus === "CLOSED") {
    auditFail(
      req,
      "atenciones.cancel.failed",
      "Cancel atencion failed",
      { reason: "already_closed", atencionId: id },
      { entity: "Atencion", id: String(id) },
    )
    throw new ConflictError("No se puede cancelar una atención cerrada")
  }

  if (gate.recalada.operationalStatus === "CANCELED") {
    auditFail(
      req,
      "atenciones.cancel.failed",
      "Cancel atencion failed",
      { reason: "recalada_canceled", recaladaId: gate.recalada.id },
      { entity: "Recalada", id: String(gate.recalada.id) },
    )
    throw new ConflictError("No se puede cancelar: la recalada está cancelada")
  }

  if (gate.recalada.operationalStatus === "DEPARTED") {
    auditFail(
      req,
      "atenciones.cancel.failed",
      "Cancel atencion failed",
      { reason: "recalada_departed", recaladaId: gate.recalada.id },
      { entity: "Recalada", id: String(gate.recalada.id) },
    )
    throw new ConflictError(
      "No se puede cancelar: la recalada ya finalizó (DEPARTED)",
    )
  }

  const inProgressCount = await atencionRepository.countTurnosInProgress(id)

  if (inProgressCount > 0) {
    auditFail(
      req,
      "atenciones.cancel.failed",
      "Cancel atencion failed",
      { reason: "turnos_in_progress", atencionId: id, inProgressCount },
      { entity: "Atencion", id: String(id) },
    )
    throw new ConflictError(
      "No se puede cancelar la atención: existen turnos en progreso (IN_PROGRESS)",
    )
  }

  const when = new Date()
  const updated = await atencionRepository.cancelAtencionAtomic({
    id,
    reason,
    actorUserId,
    when,
  })

  logger.info(
    { atencionId: id, actorUserId, canceledAt: when.toISOString() },
    "[Atenciones] canceled",
  )

  auditOk(
    req,
    "atenciones.cancel.success",
    "Atencion canceled",
    {
      atencionId: id,
      recaladaId: updated.recaladaId,
      codigoRecalada: updated.recalada?.codigoRecalada,
      actorUserId,
      canceledAt: when.toISOString(),
      reason,
    },
    { entity: "Atencion", id: String(id) },
  )

  return updated
}