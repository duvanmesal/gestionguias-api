import type { Request } from "express"

import { logger } from "../../../libs/logger"
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "../../../libs/errors"

import { turnoRepository } from "../_data/turno.repository"
import { assertOperacionPermitida } from "../_domain/turno.rules"
import { auditFail, auditOk } from "../_shared/turno.audit"
import { emitTurnoRealtime } from "../../../core/socket/domain-events"

/**
 * Epica 5 — Doble check-in: el supervisor rechaza una solicitud pendiente.
 * El turno queda en ASSIGNED y se conserva el motivo del rechazo.
 * El rechazo NO genera NO_SHOW automáticamente (eso queda para Epica 6).
 */
export async function rejectCheckInUsecase(
  req: Request,
  turnoId: number,
  reason: string,
  actorUserId: string,
) {
  const trimmed = reason?.trim()
  if (!trimmed) {
    auditFail(
      req,
      "turnos.checkin.reject.failed",
      "Reject check-in failed",
      { reason: "missing_reason", turnoId },
      { entity: "Turno", id: String(turnoId) },
    )
    throw new BadRequestError("Debes indicar un motivo para rechazar el check-in")
  }

  const current = await turnoRepository.findGateForOperacion(turnoId)

  if (!current) {
    auditFail(
      req,
      "turnos.checkin.reject.failed",
      "Reject check-in failed",
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
      "turnos.checkin.reject.failed",
      "Reject check-in failed",
      { reason: "invalid_status", turnoId, status: current.status },
      { entity: "Turno", id: String(turnoId) },
    )
    throw new ConflictError(
      "Solo se puede rechazar el check-in si el turno está ASSIGNED",
    )
  }

  if (!current.checkInRequestedAt) {
    auditFail(
      req,
      "turnos.checkin.reject.failed",
      "Reject check-in failed",
      { reason: "no_request", turnoId },
      { entity: "Turno", id: String(turnoId) },
    )
    throw new ConflictError("No hay solicitud de check-in pendiente para este turno")
  }

  if (current.checkInConfirmedAt) {
    auditFail(
      req,
      "turnos.checkin.reject.failed",
      "Reject check-in failed",
      { reason: "already_confirmed", turnoId },
      { entity: "Turno", id: String(turnoId) },
    )
    throw new ConflictError("La solicitud de check-in ya fue confirmada")
  }

  if (current.checkInRejectedAt) {
    auditFail(
      req,
      "turnos.checkin.reject.failed",
      "Reject check-in failed",
      { reason: "already_rejected", turnoId },
      { entity: "Turno", id: String(turnoId) },
    )
    throw new ConflictError("La solicitud de check-in ya fue rechazada")
  }

  const now = new Date()

  const updated = await turnoRepository.transaction(async (tx) => {
    const result = await turnoRepository.rejectCheckInIfStillPending(
      { turnoId, supervisorUserId: actorUserId, now, reason: trimmed },
      tx,
    )

    if (result.count !== 1) {
      throw new ConflictError(
        "No fue posible rechazar el check-in: el turno ya no cumple condiciones",
      )
    }

    return turnoRepository.findById(turnoId, tx)
  })

  if (!updated) throw new BadRequestError("No fue posible rechazar el check-in")

  logger.info(
    { turnoId, atencionId: updated.atencionId, actorUserId, reason: trimmed },
    "[Turnos] check-in rejected",
  )

  auditOk(
    req,
    "turnos.checkin.reject.success",
    "Turno check-in rechazado",
    {
      turnoId,
      atencionId: updated.atencionId,
      actorUserId,
      checkInRejectedAt: now.toISOString(),
      reason: trimmed,
      status: updated.status,
    },
    { entity: "Turno", id: String(turnoId) },
  )

  emitTurnoRealtime("turno:checkInRejected", updated, {
    meta: { checkInRejectedAt: now.toISOString(), reason: trimmed },
  })

  return updated
}
