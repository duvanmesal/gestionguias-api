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

export async function checkOutTurnoUsecase(req: Request, turnoId: number, actorUserId: string) {
  const actorGuiaId = await turnoRepository.getActorGuiaIdOrThrow(actorUserId)

  const current = await turnoRepository.findGateForOperacion(turnoId)

  if (!current) {
    auditFail(
      req,
      "turnos.checkout.failed",
      "Check-out failed",
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

  if (current.status !== "IN_PROGRESS") {
    auditFail(
      req,
      "turnos.checkout.failed",
      "Check-out failed",
      { reason: "invalid_status", turnoId, status: current.status },
      { entity: "Turno", id: String(turnoId) },
    )
    throw new ConflictError("Solo se puede hacer check-out si el turno está IN_PROGRESS")
  }

  if (!current.guiaId) {
    auditFail(
      req,
      "turnos.checkout.failed",
      "Check-out failed",
      { reason: "no_guia", turnoId },
      { entity: "Turno", id: String(turnoId) },
    )
    throw new ConflictError("El turno no tiene guía asignado")
  }

  if (current.guiaId !== actorGuiaId) {
    auditFail(
      req,
      "turnos.checkout.failed",
      "Check-out failed",
      { reason: "guia_mismatch", turnoId, actorGuiaId, turnoGuiaId: current.guiaId },
      { entity: "Turno", id: String(turnoId) },
    )
    throw new ConflictError("No puedes hacer check-out en un turno asignado a otro guía")
  }

  const now = new Date()

  const updated = await turnoRepository.transaction(async (tx) => {
    const result = await turnoRepository.checkOutIfStillInProgress({ turnoId, guiaId: actorGuiaId, now }, tx)

    if (result.count !== 1) {
      throw new ConflictError("No fue posible hacer check-out: el turno ya no cumple condiciones")
    }

    return turnoRepository.findById(turnoId, tx)
  })

  if (!updated) throw new BadRequestError("No fue posible hacer check-out")

  logger.info(
    { turnoId, atencionId: updated.atencionId, guiaId: actorGuiaId, actorUserId },
    "[Turnos] check-out",
  )

  auditOk(
    req,
    "turnos.checkout.success",
    "Turno check-out",
    {
      turnoId,
      atencionId: updated.atencionId,
      guiaId: actorGuiaId,
      actorUserId,
      checkOutAt: now.toISOString(),
      status: updated.status,
    },
    { entity: "Turno", id: String(turnoId) },
  )

  return updated
}