import type { Request } from "express"
import type { RolType } from "@prisma/client"

import { logger } from "../../../libs/logger"
import { ConflictError, ForbiddenError, NotFoundError } from "../../../libs/errors"

import { turnoRepository } from "../_data/turno.repository"
import { auditFail, auditOk } from "../_shared/turno.audit"

export async function unassignTurnoUsecase(
  req: Request,
  turnoId: number,
  reason: string | undefined,
  actorUserId: string,
  actorRol: RolType,
) {
  const current = await turnoRepository.findForUnassign(turnoId)

  if (!current) {
    auditFail(
      req,
      "turnos.unassign.failed",
      "Unassign turno failed",
      { reason: "not_found", turnoId },
      { entity: "Turno", id: String(turnoId) },
    )
    throw new NotFoundError("Turno no encontrado")
  }

  // Si el actor es GUIA, solo puede liberar su propio turno
  if (actorRol === "GUIA") {
    const actorGuiaId = await turnoRepository.getActorGuiaIdOrThrow(actorUserId)
    if (current.guiaId !== actorGuiaId) {
      auditFail(
        req,
        "turnos.unassign.failed",
        "Unassign turno failed",
        { reason: "not_owner", turnoId, actorGuiaId, ownerGuiaId: current.guiaId },
        { entity: "Turno", id: String(turnoId) },
      )
      throw new ForbiddenError("Solo puedes liberar tus propios turnos")
    }
  }

  if (current.status === "IN_PROGRESS" || current.status === "COMPLETED") {
    auditFail(
      req,
      "turnos.unassign.failed",
      "Unassign turno failed",
      { reason: "invalid_status", turnoId, status: current.status },
      { entity: "Turno", id: String(turnoId) },
    )
    throw new ConflictError("No se puede desasignar un turno en progreso o completado")
  }

  if (current.status !== "ASSIGNED") {
    auditFail(
      req,
      "turnos.unassign.failed",
      "Unassign turno failed",
      { reason: "not_assigned", turnoId, status: current.status },
      { entity: "Turno", id: String(turnoId) },
    )
    throw new ConflictError("Solo se puede desasignar un turno en estado ASSIGNED")
  }

  const updated = await turnoRepository.unassign(turnoId)

  logger.info(
    { turnoId, atencionId: updated.atencionId, prevGuiaId: current.guiaId, actorUserId, reason },
    "[Turnos] unassigned",
  )

  auditOk(
    req,
    "turnos.unassign.success",
    "Turno unassigned",
    {
      turnoId,
      atencionId: updated.atencionId,
      prevGuiaId: current.guiaId,
      actorUserId,
      reason: reason ?? null,
    },
    { entity: "Turno", id: String(turnoId) },
  )

  return updated
}