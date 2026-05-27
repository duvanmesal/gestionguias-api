import type { Request } from "express"
import { TurnoAssignmentMode } from "@prisma/client"

import { logger } from "../../../libs/logger"
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "../../../libs/errors"

import { turnoRepository } from "../_data/turno.repository"
import { assertOperacionPermitida, buildNoShowObservacion } from "../_domain/turno.rules"
import { auditFail, auditOk } from "../_shared/turno.audit"
import { emitTurnoRealtime } from "../../../core/socket/domain-events"
import { autoAssignNextInQueue } from "../../disponibilidad/_usecases/autoAssign.usecase"
import { operationalConfigService } from "../../operational-config/operational-config.service"
import { penaltyService } from "../../penalties/penalty.service"

/**
 * Epica 6 — Marcado NO_SHOW.
 * - `reason` es obligatorio (mín. 3 caracteres). Se persiste en la
 *   penalización y en la observación del turno.
 * - Se crea una `GuiaPenalty` con vigencia calculada según
 *   `OperationalConfig.noShowPenaltyDurationHours`.
 * - `pendingPenalty` queda como indicador derivado sincronizado.
 */
export async function noShowTurnoUsecase(
  req: Request,
  turnoId: number,
  reason: string | undefined,
  actorUserId: string,
) {
  const trimmedReason = reason?.trim() ?? ""
  if (trimmedReason.length < 3) {
    auditFail(
      req,
      "turnos.noShow.failed",
      "NO_SHOW failed",
      { reason: "missing_or_short_reason", turnoId },
      { entity: "Turno", id: String(turnoId) },
    )
    throw new BadRequestError(
      "Debes indicar un motivo de al menos 3 caracteres para marcar NO_SHOW",
    )
  }

  const current = await turnoRepository.findGateForOperacion(turnoId)

  if (!current) {
    auditFail(
      req,
      "turnos.noShow.failed",
      "NO_SHOW failed",
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
      "turnos.noShow.failed",
      "NO_SHOW failed",
      { reason: "invalid_status", turnoId, status: current.status },
      { entity: "Turno", id: String(turnoId) },
    )
    throw new ConflictError("Solo se puede marcar NO_SHOW si el turno está ASSIGNED")
  }

  const now = new Date()
  if (current.fechaInicio && now < current.fechaInicio) {
    auditFail(
      req,
      "turnos.noShow.failed",
      "NO_SHOW failed",
      {
        reason: "turno_not_started",
        turnoId,
        fechaInicio: current.fechaInicio.toISOString(),
        now: now.toISOString(),
      },
      { entity: "Turno", id: String(turnoId) },
    )
    throw new BadRequestError(
      "No se puede marcar NO_SHOW antes de que comience el turno",
    )
  }

  const extra = buildNoShowObservacion(trimmedReason)
  const mergedObs = current.observaciones?.trim()
    ? `${current.observaciones.trim()} | ${extra}`
    : extra

  const updated = await turnoRepository.transaction(async (tx) => {
    const result = await turnoRepository.noShowIfStillAssigned({ turnoId, mergedObs }, tx)

    if (result.count !== 1) {
      throw new ConflictError("No fue posible marcar NO_SHOW: el turno ya no cumple condiciones")
    }

    // Penalización persistente con vigencia (Epica 6).
    if (current.guiaId) {
      await penaltyService.applyNoShowPenalty(
        req,
        {
          guiaId: current.guiaId,
          turnoId,
          reason: trimmedReason,
          atencionId: current.atencionId,
          actorUserId,
        },
        tx,
      )
    }

    return turnoRepository.findById(turnoId, tx)
  })

  if (!updated) throw new BadRequestError("No fue posible marcar NO_SHOW")

  logger.info(
    { turnoId, atencionId: updated.atencionId, guiaId: current.guiaId, actorUserId, reason: trimmedReason },
    "[Turnos] no-show",
  )

  auditOk(
    req,
    "turnos.noShow.success",
    "Turno NO_SHOW",
    {
      turnoId,
      atencionId: updated.atencionId,
      actorUserId,
      reason: trimmedReason,
      status: updated.status,
      recaladaId: updated.atencion.recaladaId,
      codigoRecalada: updated.atencion.recalada.codigoRecalada,
    },
    { entity: "Turno", id: String(turnoId) },
  )

  emitTurnoRealtime("turno:noShow", updated)

  if (current.guiaId) {
    // Notificación realtime al guía con la vigencia de la penalización.
    const guiaAusente = await turnoRepository.findGuiaById(current.guiaId)
    const active = await penaltyService.findActiveForGuia(current.guiaId)
    if (guiaAusente?.usuario?.id && active) {
      penaltyService.notifyPenalized({
        guiaUserId: guiaAusente.usuario.id,
        turnoId,
        atencionId: updated.atencionId,
        expiresAt: active.expiresAt,
        reason: trimmedReason,
      })
    }

    const assignmentMode = await operationalConfigService.getTurnoAssignmentMode()
    if (assignmentMode === TurnoAssignmentMode.FIFO_GLOBAL) {
      autoAssignNextInQueue(updated.atencionId, turnoId).catch((err) =>
        logger.error({ err, turnoId, atencionId: updated.atencionId }, "[Turnos] error reasignando tras NO_SHOW"),
      )
    }
  }

  return updated
}
