import type { Request } from "express"

import { logger } from "../../../libs/logger"
import { ConflictError, NotFoundError } from "../../../libs/errors"

import { turnoRepository } from "../_data/turno.repository"
import { assertOperacionPermitida } from "../_domain/turno.rules"
import { auditFail, auditOk } from "../_shared/turno.audit"
import { emitTurnoRealtime } from "../../../core/socket/domain-events"
import { notifyTurnoCanceledToGuide } from "../../notifications/operational-notifications"

export async function cancelTurnoUsecase(
  req: Request,
  turnoId: number,
  cancelReason: string | undefined,
  actorUserId: string,
) {
  const current = await turnoRepository.findGateForOperacion(turnoId)

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

  if (current.status !== "AVAILABLE" && current.status !== "ASSIGNED") {
    auditFail(
      req,
      "turnos.cancel.failed",
      "Cancel turno failed",
      { reason: "invalid_status", turnoId, status: current.status },
      { entity: "Turno", id: String(turnoId) },
    )
    throw new ConflictError("Solo se puede cancelar un turno AVAILABLE o ASSIGNED")
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

  emitTurnoRealtime("turno:canceled", updated)

  // Epica 7 — Notificar al guía afectado (si había uno asignado).
  const previousGuiaUserId = current.guia?.usuario?.id ?? null
  const previousGuiaId = current.guiaId ?? null
  if (previousGuiaUserId && previousGuiaId) {
    notifyTurnoCanceledToGuide({
      turnoId: updated.id,
      atencionId: updated.atencionId,
      recaladaId: updated.atencion?.recaladaId ?? null,
      codigoRecalada: updated.atencion?.recalada?.codigoRecalada ?? null,
      guiaUserId: previousGuiaUserId,
      guiaId: previousGuiaId,
      reason: cancelReason?.trim() ? cancelReason.trim() : null,
    }).catch((err) =>
      logger.error({ err, turnoId: updated.id }, "[Turnos] notify cancel push failed"),
    )
  }

  return updated
}
