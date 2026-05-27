import type { Request } from "express"
import { TurnoAssignmentMode } from "@prisma/client"

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
import { operationalConfigService } from "../../operational-config/operational-config.service"
import { penaltyService } from "../../penalties/penalty.service"
import { notifyTurnoClaimedToGuide } from "../../notifications/operational-notifications"

export async function claimTurnoUsecase(req: Request, turnoId: number, actorUserId: string) {
  const assignmentMode = await operationalConfigService.getTurnoAssignmentMode()
  if (assignmentMode === TurnoAssignmentMode.FIFO_GLOBAL) {
    auditFail(
      req,
      "turnos.claim.failed",
      "Claim turno failed",
      { reason: "fifo_mode_active", turnoId, actorUserId, assignmentMode },
      { entity: "Turno", id: String(turnoId) },
    )
    throw new ConflictError("El modo FIFO está activo. Los turnos se asignan automáticamente.")
  }

  const guia = await turnoRepository.findGuiaByUserId(actorUserId)
  if (!guia) {
    throw new ConflictError("El usuario autenticado no está asociado a un guía")
  }
  if (!guia.usuario.activo) {
    throw new ConflictError("Tu cuenta de guía está inactiva")
  }
  if (!guia.disponibleParaTurnos) {
    auditFail(
      req,
      "turnos.claim.failed",
      "Claim turno failed",
      { reason: "guia_not_available_global", turnoId, actorUserId, actorGuiaId: guia.id },
      { entity: "Guia", id: guia.id },
    )
    throw new ConflictError("Debes marcarte disponible para tomar un turno")
  }
  // Epica 6: re-evaluar vigencia (lazy sync).
  const claimPenaltyStatus = await penaltyService.isCurrentlyPenalized({
    guiaId: guia.id,
    pendingPenalty: guia.pendingPenalty,
  })
  if (claimPenaltyStatus.penalized) {
    auditFail(
      req,
      "turnos.claim.failed",
      "Claim turno failed",
      {
        reason: "guia_pending_penalty",
        turnoId,
        actorUserId,
        actorGuiaId: guia.id,
        penaltyExpiresAt: claimPenaltyStatus.activePenalty?.expiresAt?.toISOString() ?? null,
      },
      { entity: "Guia", id: guia.id },
    )
    throw new ConflictError(
      claimPenaltyStatus.activePenalty
        ? `No puedes tomar turno: tienes una penalización vigente hasta ${claimPenaltyStatus.activePenalty.expiresAt.toISOString()}`
        : "No puedes tomar turno porque tienes una penalización pendiente",
    )
  }

  const actorGuiaId = guia.id

  const current = await turnoRepository.findGateForOperacion(turnoId)

  if (!current) {
    auditFail(
      req,
      "turnos.claim.failed",
      "Claim turno failed",
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

  const inProgress = await turnoRepository.findActiveForGuia(actorGuiaId)
  if (inProgress) {
    auditFail(
      req,
      "turnos.claim.failed",
      "Claim turno failed",
      { reason: "guia_in_progress", turnoId, actorGuiaId, activeTurnoId: inProgress.id },
      { entity: "Turno", id: String(turnoId) },
    )
    throw new ConflictError(
      "Ya tienes un turno en curso. Finalízalo antes de tomar otro.",
    )
  }

  if (current.status !== "AVAILABLE" || current.guiaId !== null) {
    auditFail(
      req,
      "turnos.claim.failed",
      "Claim turno failed",
      { reason: "not_available", turnoId, status: current.status, guiaId: current.guiaId },
      { entity: "Turno", id: String(turnoId) },
    )
    throw new ConflictError("El turno no está disponible para tomar")
  }

  const firstAvailable = await turnoRepository.findFirstAvailableTurnoForAtencion(
    current.atencionId,
  )
  if (!firstAvailable || firstAvailable.id !== turnoId) {
    auditFail(
      req,
      "turnos.claim.failed",
      "Claim turno failed",
      {
        reason: "not_first_available",
        turnoId,
        atencionId: current.atencionId,
        firstAvailableTurnoId: firstAvailable?.id ?? null,
        firstAvailableNumero: firstAvailable?.numero ?? null,
        requestedNumero: current.numero,
      },
      { entity: "Turno", id: String(turnoId) },
    )
    throw new ConflictError(
      "Debes tomar primero el turno disponible más antiguo de esta atención",
    )
  }

  const existing = await turnoRepository.findExistingTurnoForGuia({
    atencionId: current.atencionId,
    guiaId: actorGuiaId,
  })

  if (existing) {
    auditFail(
      req,
      "turnos.claim.failed",
      "Claim turno failed",
      {
        reason: "already_has_turno_in_atencion",
        turnoId,
        atencionId: current.atencionId,
        actorGuiaId,
      },
      { entity: "Turno", id: String(turnoId) },
    )
    throw new ConflictError("Ya tienes un turno asignado en esta atención")
  }

  if (current.fechaInicio && current.fechaFin) {
    const overlap = await turnoRepository.findOverlappingTurnoForGuia({
      guiaId: actorGuiaId,
      fechaInicio: current.fechaInicio,
      fechaFin: current.fechaFin,
      excludeTurnoId: turnoId,
    })
    if (overlap) {
      auditFail(
        req,
        "turnos.claim.failed",
        "Claim turno failed",
        {
          reason: "guia_schedule_overlap",
          turnoId,
          actorGuiaId,
          conflictingTurnoId: overlap.id,
          fechaInicio: current.fechaInicio,
          fechaFin: current.fechaFin,
        },
        { entity: "Turno", id: String(turnoId) },
      )
      throw new ConflictError(
        "Ya tienes un turno asignado en ese horario en otra atención",
      )
    }
  }

  try {
    const updated = await turnoRepository.transaction(async (tx) => {
      const firstAvailableInTx = await turnoRepository.findFirstAvailableTurnoForAtencion(
        current.atencionId,
        tx,
      )
      if (!firstAvailableInTx || firstAvailableInTx.id !== turnoId) {
        throw new ConflictError(
          "Debes tomar primero el turno disponible más antiguo de esta atención",
        )
      }

      const result = await turnoRepository.claimIfStillAvailable({ turnoId, guiaId: actorGuiaId }, tx)

      if (result.count !== 1) {
        throw new ConflictError("No fue posible tomar: el turno ya no está disponible")
      }

      return turnoRepository.findById(turnoId, tx)
    })

    if (!updated) throw new BadRequestError("No fue posible tomar el turno")

    logger.info(
      { turnoId, atencionId: updated.atencionId, guiaId: actorGuiaId, actorUserId },
      "[Turnos] claimed",
    )

    auditOk(
      req,
      "turnos.claim.success",
      "Turno claimed",
      {
        turnoId,
        atencionId: updated.atencionId,
        actorUserId,
        actorGuiaId,
        status: updated.status,
        recaladaId: updated.atencion.recaladaId,
        codigoRecalada: updated.atencion.recalada.codigoRecalada,
      },
      { entity: "Turno", id: String(turnoId) },
    )

    emitTurnoRealtime("turno:claimed", updated)

    // Epica 7 — Notificar al guía que tomó el turno.
    notifyTurnoClaimedToGuide({
      turnoId: updated.id,
      atencionId: updated.atencionId,
      recaladaId: updated.atencion?.recaladaId ?? null,
      codigoRecalada: updated.atencion?.recalada?.codigoRecalada ?? null,
      guiaUserId: actorUserId,
      guiaId: actorGuiaId,
      fechaInicio: updated.fechaInicio ?? null,
      fechaFin: updated.fechaFin ?? null,
    }).catch((err) =>
      logger.error({ err, turnoId: updated.id }, "[Turnos] notify claim push failed"),
    )

    return updated
  } catch (err: any) {
    if (err?.code === "P2002") {
      auditFail(
        req,
        "turnos.claim.failed",
        "Claim turno failed",
        { reason: "unique_conflict", turnoId, actorGuiaId },
        { entity: "Turno", id: String(turnoId) },
      )
      throw new ConflictError("Ya tienes un turno asignado en esta atención")
    }

    throw err
  }
}
