import type { Request } from "express"

import { logger } from "../../../libs/logger"
import { ConflictError, NotFoundError } from "../../../libs/errors"

import { atencionRepository } from "../_data/atencion.repository"
import { auditFail, auditOk } from "../_shared/atencion.audit"

export async function closeAtencionUsecase(req: Request, id: number, actorUserId: string) {
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

  const updated = await atencionRepository.closeAtencion({ id })

  logger.info({ atencionId: id, actorUserId }, "[Atenciones] closed")

  auditOk(
    req,
    "atenciones.close.success",
    "Atencion closed",
    {
      atencionId: id,
      recaladaId: updated.recaladaId,
      actorUserId,
    },
    { entity: "Atencion", id: String(id) },
  )

  return updated
}