import type { Request } from "express"

import { logger } from "../../../libs/logger"
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "../../../libs/errors"

import { turnoRepository } from "../_data/turno.repository"
import { assertOperacionPermitida, ENFORCE_FIFO_CHECKIN } from "../_domain/turno.rules"
import { auditFail, auditOk } from "../_shared/turno.audit"

export async function checkInTurnoUsecase(req: Request, turnoId: number, actorUserId: string) {
  const actorGuiaId = await turnoRepository.getActorGuiaIdOrThrow(actorUserId)

  const current = await turnoRepository.findGateForOperacion(turnoId)

  if (!current) {
    auditFail(
      req,
      "turnos.checkin.failed",
      "Check-in failed",
      { reason: "not_found", turnoId },
      { entity: "Turno", id: String(turnoId) },
    )
    throw new NotFoundError("Turno no encontrado")
  }

  assertOperacionPermitida({
    atencion: {
      status: current.atencion.status,
      operationalStatus: current.atencion.operationalStatus,
    },
    recalada: {
      status: current.atencion.recalada.status,
      operationalStatus: current.atencion.recalada.operationalStatus,
    },
  })

  if (current.status !== "ASSIGNED") {
    auditFail(
      req,
      "turnos.checkin.failed",
      "Check-in failed",
      { reason: "invalid_status", turnoId, status: current.status },
      { entity: "Turno", id: String(turnoId) },
    )
    throw new ConflictError("Solo se puede hacer check-in si el turno está ASSIGNED")
  }

  if (!current.guiaId) {
    auditFail(
      req,
      "turnos.checkin.failed",
      "Check-in failed",
      { reason: "no_guia", turnoId },
      { entity: "Turno", id: String(turnoId) },
    )
    throw new ConflictError("El turno no tiene guía asignado")
  }

  if (current.guiaId !== actorGuiaId) {
    auditFail(
      req,
      "turnos.checkin.failed",
      "Check-in failed",
      { reason: "guia_mismatch", turnoId, actorGuiaId, turnoGuiaId: current.guiaId },
      { entity: "Turno", id: String(turnoId) },
    )
    throw new ConflictError("No puedes hacer check-in en un turno asignado a otro guía")
  }

  if (ENFORCE_FIFO_CHECKIN) {
    const prevPending = await turnoRepository.findPrevPendingAssignedTurno({
      atencionId: current.atencionId,
      numero: current.numero,
    })

    if (prevPending) {
      auditFail(
        req,
        "turnos.checkin.failed",
        "Check-in failed",
        { reason: "fifo_blocked", turnoId, prevPendingNumero: prevPending.numero },
        { entity: "Turno", id: String(turnoId) },
      )
      throw new ConflictError(
        "No puedes hacer check-in aún: hay un turno anterior pendiente (FIFO)",
      )
    }
  }

  const now = new Date()

  const updated = await turnoRepository.transaction(async (tx) => {
    const result = await turnoRepository.checkInIfStillAssigned({ turnoId, guiaId: actorGuiaId, now }, tx)

    if (result.count !== 1) {
      throw new ConflictError("No fue posible hacer check-in: el turno ya no cumple condiciones")
    }

    return turnoRepository.findById(turnoId, tx)
  })

  if (!updated) throw new BadRequestError("No fue posible hacer check-in")

  logger.info(
    { turnoId, atencionId: updated.atencionId, guiaId: actorGuiaId, actorUserId },
    "[Turnos] check-in",
  )

  auditOk(
    req,
    "turnos.checkin.success",
    "Turno check-in",
    {
      turnoId,
      atencionId: updated.atencionId,
      guiaId: actorGuiaId,
      actorUserId,
      checkInAt: now.toISOString(),
      status: updated.status,
    },
    { entity: "Turno", id: String(turnoId) },
  )

  return updated
}