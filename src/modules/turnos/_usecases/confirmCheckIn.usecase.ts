// MORIRE
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
 * Epica 5 — Doble check-in: el supervisor confirma una solicitud pendiente.
 * Al confirmar, el turno pasa oficialmente a IN_PROGRESS y `checkInAt`
 * se materializa con el momento de la solicitud del guía.
 */
export async function confirmCheckInUsecase(
  req: Request,
  turnoId: number,
  actorUserId: string,
) {
  // Supervisor entra, el check-in deja de estar en modo Schrodinger.
  const current = await turnoRepository.findGateForOperacion(turnoId)

  if (!current) {
    auditFail(
      req,
      "turnos.checkin.confirm.failed",
      "Confirm check-in failed",
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
      "turnos.checkin.confirm.failed",
      "Confirm check-in failed",
      { reason: "invalid_status", turnoId, status: current.status },
      { entity: "Turno", id: String(turnoId) },
    )
    throw new ConflictError(
      "Solo se puede confirmar el check-in si el turno está ASSIGNED",
    )
  }

  if (!current.checkInRequestedAt) {
    auditFail(
      req,
      "turnos.checkin.confirm.failed",
      "Confirm check-in failed",
      { reason: "no_request", turnoId },
      { entity: "Turno", id: String(turnoId) },
    )
    throw new ConflictError("No hay solicitud de check-in pendiente para este turno")
  }

  if (current.checkInConfirmedAt) {
    auditFail(
      req,
      "turnos.checkin.confirm.failed",
      "Confirm check-in failed",
      { reason: "already_confirmed", turnoId },
      { entity: "Turno", id: String(turnoId) },
    )
    throw new ConflictError("La solicitud de check-in ya fue confirmada")
  }

  if (current.checkInRejectedAt) {
    auditFail(
      req,
      "turnos.checkin.confirm.failed",
      "Confirm check-in failed",
      { reason: "already_rejected", turnoId },
      { entity: "Turno", id: String(turnoId) },
    )
    throw new ConflictError("La solicitud de check-in ya fue rechazada")
  }

  const now = new Date()

  // al decimo intento, por que hacerlo bien a la primera era demasiado pa este mundo.
  const updated = await turnoRepository.transaction(async (tx) => {
    const result = await turnoRepository.confirmCheckInIfStillPending(
      { turnoId, supervisorUserId: actorUserId, now },
      tx,
    )

    if (result.count !== 1) {
      throw new ConflictError(
        "No fue posible confirmar el check-in: el turno ya no cumple condiciones",
      )
    }

    return turnoRepository.findById(turnoId, tx)
  })

  if (!updated) throw new BadRequestError("No fue posible confirmar el check-in")

  logger.info(
    { turnoId, atencionId: updated.atencionId, actorUserId },
    "[Turnos] check-in confirmed",
  )

  auditOk(
    req,
    "turnos.checkin.confirm.success",
    "Turno check-in confirmado",
    {
      turnoId,
      atencionId: updated.atencionId,
      actorUserId,
      checkInConfirmedAt: now.toISOString(),
      status: updated.status,
    },
    { entity: "Turno", id: String(turnoId) },
  )

  emitTurnoRealtime("turno:checkInConfirmed", updated, {
    meta: { checkInConfirmedAt: now.toISOString() },
  })

  return updated
}
// NO MORI :D