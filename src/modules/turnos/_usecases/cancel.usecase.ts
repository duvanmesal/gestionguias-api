import type { Request } from "express"

import { logger } from "../../../libs/logger"
import { ConflictError, NotFoundError } from "../../../libs/errors"

import { turnoRepository } from "../_data/turno.repository"
import { auditFail, auditOk } from "../_shared/turno.audit"

export async function cancelTurnoUsecase(
  req: Request,
  turnoId: number,
  cancelReason: string | undefined,
  actorUserId: string,
) {
  const current = await turnoRepository.findForCancel(turnoId)

  if (!current) {
    auditFail(
      req,
      "turnos.cancel.failed",
      "Cancel turno failed",
      { reason: "not_found", turnoId },
      { entity: "Turno", id: String(turnoId) },
    )
    throw new NotFoundError("Turno no encontrado")
  }

  if (current.status === "COMPLETED") {
    auditFail(
      req,
      "turnos.cancel.failed",
      "Cancel turno failed",
      { reason: "completed", turnoId },
      { entity: "Turno", id: String(turnoId) },
    )
    throw new ConflictError("No se puede cancelar un turno completado")
  }
  if (current.status === "IN_PROGRESS") {
    auditFail(
      req,
      "turnos.cancel.failed",
      "Cancel turno failed",
      { reason: "in_progress", turnoId },
      { entity: "Turno", id: String(turnoId) },
    )
    throw new ConflictError("No se puede cancelar un turno en progreso")
  }
  if (current.status === "CANCELED") {
    auditFail(
      req,
      "turnos.cancel.failed",
      "Cancel turno failed",
      { reason: "already_canceled", turnoId },
      { entity: "Turno", id: String(turnoId) },
    )
    throw new ConflictError("El turno ya está cancelado")
  }

  const now = new Date()

  const updated = await turnoRepository.cancel({ turnoId, now, cancelReason, actorUserId })

  logger.info(
    { turnoId, atencionId: updated.atencionId, guiaId: updated.guiaId, actorUserId, cancelReason },
    "[Turnos] canceled",
  )

  auditOk(
    req,
    "turnos.cancel.success",
    "Turno canceled",
    {
      turnoId,
      atencionId: updated.atencionId,
      guiaId: updated.guiaId,
      actorUserId,
      cancelReason: cancelReason?.trim() ? cancelReason.trim() : null,
      canceledAt: now.toISOString(),
    },
    { entity: "Turno", id: String(turnoId) },
  )

  return updated
}