import type { Request } from "express"

import { logger } from "../../../libs/logger"
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "../../../libs/errors"

import { turnoRepository } from "../_data/turno.repository"
import { assertOperacionPermitida, ENFORCE_FIFO_CHECKIN, CHECKIN_EARLY_WINDOW_MS } from "../_domain/turno.rules"
import { auditFail, auditOk } from "../_shared/turno.audit"
import { emitTurnoRealtime } from "../../../core/socket/domain-events"
import { notifySupervisorCheckInPending } from "../../notifications/operational-notifications"
import { prisma } from "../../../prisma/client"

/**
 * Epica 5 — Doble check-in.
 * Esta operacion ya NO inicia el turno. Solo registra la solicitud del guia.
 * El turno permanece en ASSIGNED y queda con `checkInRequestedAt`. Recien
 * cuando el supervisor confirma, pasa a IN_PROGRESS.
 */
export async function checkInTurnoUsecase(req: Request, turnoId: number, actorUserId: string) {
  const actorGuiaId = await turnoRepository.getActorGuiaIdOrThrow(actorUserId)

  const current = await turnoRepository.findGateForOperacion(turnoId)

  if (!current) {
    auditFail(
      req,
      "turnos.checkin.failed",
      "Check-in request failed",
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
      "Check-in request failed",
      { reason: "invalid_status", turnoId, status: current.status },
      { entity: "Turno", id: String(turnoId) },
    )
    throw new ConflictError("Solo se puede solicitar check-in si el turno está ASSIGNED")
  }

  if (!current.guiaId) {
    auditFail(
      req,
      "turnos.checkin.failed",
      "Check-in request failed",
      { reason: "no_guia", turnoId },
      { entity: "Turno", id: String(turnoId) },
    )
    throw new ConflictError("El turno no tiene guía asignado")
  }

  if (current.guiaId !== actorGuiaId) {
    auditFail(
      req,
      "turnos.checkin.failed",
      "Check-in request failed",
      { reason: "guia_mismatch", turnoId, actorGuiaId, turnoGuiaId: current.guiaId },
      { entity: "Turno", id: String(turnoId) },
    )
    throw new ConflictError("No puedes solicitar check-in en un turno asignado a otro guía")
  }

  if (current.checkInRequestedAt && !current.checkInRejectedAt) {
    auditFail(
      req,
      "turnos.checkin.failed",
      "Check-in request failed",
      { reason: "already_pending", turnoId },
      { entity: "Turno", id: String(turnoId) },
    )
    throw new ConflictError("Ya existe una solicitud de check-in pendiente para este turno")
  }

  if (current.checkInRejectedAt) {
    auditFail(
      req,
      "turnos.checkin.failed",
      "Check-in request failed",
      { reason: "already_rejected", turnoId },
      { entity: "Turno", id: String(turnoId) },
    )
    throw new ConflictError(
      "La solicitud anterior fue rechazada por el supervisor. Contacta a operaciones.",
    )
  }

  const now = new Date()

  if (current.fechaInicio && now < new Date(current.fechaInicio.getTime() - CHECKIN_EARLY_WINDOW_MS)) {
    auditFail(
      req,
      "turnos.checkin.failed",
      "Check-in request failed",
      { reason: "too_early", turnoId, fechaInicio: current.fechaInicio },
      { entity: "Turno", id: String(turnoId) },
    )
    throw new BadRequestError(
      "Demasiado temprano para solicitar check-in (más de 30 minutos antes del inicio del turno)",
    )
  }

  if (current.fechaFin && now > current.fechaFin) {
    auditFail(
      req,
      "turnos.checkin.failed",
      "Check-in request failed",
      { reason: "past_fin", turnoId, fechaFin: current.fechaFin },
      { entity: "Turno", id: String(turnoId) },
    )
    throw new BadRequestError(
      "El turno ya finalizó su horario programado. Contacta al supervisor.",
    )
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
        "Check-in request failed",
        { reason: "fifo_blocked", turnoId, prevPendingNumero: prevPending.numero },
        { entity: "Turno", id: String(turnoId) },
      )
      throw new ConflictError(
        "No puedes solicitar check-in aún: hay un turno anterior pendiente (FIFO)",
      )
    }
  }

  const updated = await turnoRepository.transaction(async (tx) => {
    const result = await turnoRepository.requestCheckInIfStillAssigned(
      { turnoId, guiaId: actorGuiaId, now },
      tx,
    )

    if (result.count !== 1) {
      throw new ConflictError(
        "No fue posible registrar la solicitud de check-in: el turno ya no cumple condiciones",
      )
    }

    return turnoRepository.findById(turnoId, tx)
  })

  if (!updated) throw new BadRequestError("No fue posible registrar la solicitud de check-in")

  logger.info(
    { turnoId, atencionId: updated.atencionId, guiaId: actorGuiaId, actorUserId },
    "[Turnos] check-in requested",
  )

  auditOk(
    req,
    "turnos.checkin.requested",
    "Turno check-in solicitado",
    {
      turnoId,
      atencionId: updated.atencionId,
      guiaId: actorGuiaId,
      actorUserId,
      checkInRequestedAt: now.toISOString(),
      status: updated.status,
    },
    { entity: "Turno", id: String(turnoId) },
  )

  emitTurnoRealtime("turno:checkInRequested", updated, {
    meta: { checkInRequestedAt: now.toISOString() },
  })

  // Epica 7 — Notificar a supervisores (fire & forget, no bloquea respuesta).
  void (async () => {
    try {
      const actorUser = await prisma.usuario.findUnique({
        where: { id: actorUserId },
        select: { nombres: true, apellidos: true },
      })
      const guiaName = actorUser ? `${actorUser.nombres} ${actorUser.apellidos}`.trim() : null
      await notifySupervisorCheckInPending({
        turnoId: updated.id,
        atencionId: updated.atencionId,
        recaladaId: updated.atencion?.recaladaId ?? null,
        codigoRecalada: updated.atencion?.recalada?.codigoRecalada ?? null,
        guiaName,
      })
    } catch (err) {
      logger.error({ err, turnoId: updated.id }, "[Turnos] notify supervisor check-in pending failed")
    }
  })()

  return updated
}
