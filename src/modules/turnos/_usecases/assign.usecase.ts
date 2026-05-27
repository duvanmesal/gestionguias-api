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
import { penaltyService } from "../../penalties/penalty.service"
import { notifyTurnoAssignedToGuide } from "../../notifications/operational-notifications"

export async function assignTurnoUsecase(
  req: Request,
  turnoId: number,
  guiaId: string,
  actorUserId: string,
) {
  if (!guiaId?.trim()) {
    auditFail(
      req,
      "turnos.assign.failed",
      "Assign turno failed",
      { reason: "missing_guiaId", turnoId },
      { entity: "Turno", id: String(turnoId) },
    )
    throw new BadRequestError("guiaId es requerido")
  }

  const guia = await turnoRepository.findGuiaById(guiaId)
  if (!guia) {
    auditFail(
      req,
      "turnos.assign.failed",
      "Assign turno failed",
      { reason: "guia_not_found", guiaId, turnoId },
      { entity: "Guia", id: guiaId },
    )
    throw new NotFoundError("Guía no encontrado (guiaId)")
  }

  if (!guia.usuario.activo) {
    auditFail(
      req,
      "turnos.assign.failed",
      "Assign turno failed",
      { reason: "guia_inactive", guiaId, turnoId },
      { entity: "Guia", id: guiaId },
    )
    throw new BadRequestError("No se puede asignar: el guía está inactivo")
  }

  if (!guia.disponibleParaTurnos) {
    auditFail(
      req,
      "turnos.assign.failed",
      "Assign turno failed",
      { reason: "guia_not_available_global", guiaId, turnoId },
      { entity: "Guia", id: guiaId },
    )
    throw new ConflictError("No se puede asignar: el guía no está disponible para turnos")
  }

  // Epica 6: re-evaluar vigencia con la entidad GuiaPenalty (lazy sync).
  const assignPenaltyStatus = await penaltyService.isCurrentlyPenalized({
    guiaId: guia.id,
    pendingPenalty: guia.pendingPenalty,
  })
  if (assignPenaltyStatus.penalized) {
    auditFail(
      req,
      "turnos.assign.failed",
      "Assign turno failed",
      {
        reason: "guia_pending_penalty",
        guiaId,
        turnoId,
        penaltyExpiresAt: assignPenaltyStatus.activePenalty?.expiresAt?.toISOString() ?? null,
      },
      { entity: "Guia", id: guiaId },
    )
    throw new ConflictError(
      assignPenaltyStatus.activePenalty
        ? `No se puede asignar: el guía tiene una penalización vigente hasta ${assignPenaltyStatus.activePenalty.expiresAt.toISOString()}`
        : "No se puede asignar: el guía tiene una penalización pendiente",
    )
  }

  const inProgress = await turnoRepository.findActiveForGuia(guiaId)
  if (inProgress) {
    auditFail(
      req,
      "turnos.assign.failed",
      "Assign turno failed",
      { reason: "guia_in_progress", guiaId, turnoId, activeTurnoId: inProgress.id },
      { entity: "Turno", id: String(turnoId) },
    )
    throw new ConflictError(
      "El guía ya tiene un turno en curso (IN_PROGRESS). Debe finalizar antes de recibir otro.",
    )
  }

  const current = await turnoRepository.findGateForOperacion(turnoId)

  if (!current) {
    auditFail(
      req,
      "turnos.assign.failed",
      "Assign turno failed",
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

  if (current.status !== "AVAILABLE" || current.guiaId !== null) {
    auditFail(
      req,
      "turnos.assign.failed",
      "Assign turno failed",
      { reason: "not_available", turnoId, status: current.status, guiaId: current.guiaId },
      { entity: "Turno", id: String(turnoId) },
    )
    throw new ConflictError("El turno no está disponible para asignación")
  }

  const existing = await turnoRepository.findExistingTurnoForGuia({
    atencionId: current.atencionId,
    guiaId,
  })

  if (existing) {
    auditFail(
      req,
      "turnos.assign.failed",
      "Assign turno failed",
      {
        reason: "guia_already_has_turno_in_atencion",
        turnoId,
        atencionId: current.atencionId,
        guiaId,
      },
      { entity: "Turno", id: String(turnoId) },
    )
    throw new ConflictError("El guía ya tiene un turno asignado en esta atención")
  }

  if (current.fechaInicio && current.fechaFin) {
    const overlap = await turnoRepository.findOverlappingTurnoForGuia({
      guiaId,
      fechaInicio: current.fechaInicio,
      fechaFin: current.fechaFin,
      excludeTurnoId: turnoId,
    })
    if (overlap) {
      auditFail(
        req,
        "turnos.assign.failed",
        "Assign turno failed",
        {
          reason: "guia_schedule_overlap",
          turnoId,
          guiaId,
          conflictingTurnoId: overlap.id,
          fechaInicio: current.fechaInicio,
          fechaFin: current.fechaFin,
        },
        { entity: "Turno", id: String(turnoId) },
      )
      throw new ConflictError(
        "El guía ya tiene un turno asignado en ese horario en otra atención",
      )
    }
  }

  try {
    const updated = await turnoRepository.transaction(async (tx) => {
      const result = await turnoRepository.assignIfStillAvailable({ turnoId, guiaId }, tx)

      if (result.count !== 1) {
        throw new ConflictError("No fue posible asignar: el turno ya no está disponible")
      }

      return turnoRepository.findById(turnoId, tx)
    })

    if (!updated) throw new BadRequestError("No fue posible asignar el turno")

    logger.info(
      { turnoId, atencionId: updated.atencionId, guiaId, actorUserId },
      "[Turnos] assigned",
    )

    auditOk(
      req,
      "turnos.assign.success",
      "Turno assigned",
      {
        turnoId,
        atencionId: updated.atencionId,
        guiaId,
        actorUserId,
        status: updated.status,
        recaladaId: updated.atencion.recaladaId,
        codigoRecalada: updated.atencion.recalada.codigoRecalada,
      },
      { entity: "Turno", id: String(turnoId) },
    )

    emitTurnoRealtime("turno:assigned", updated)

    // Epica 7 — Notificar al guía asignado.
    if (guia.usuario?.id) {
      notifyTurnoAssignedToGuide({
        turnoId: updated.id,
        atencionId: updated.atencionId,
        recaladaId: updated.atencion?.recaladaId ?? null,
        codigoRecalada: updated.atencion?.recalada?.codigoRecalada ?? null,
        guiaUserId: guia.usuario.id,
        guiaId,
        fechaInicio: updated.fechaInicio ?? null,
        fechaFin: updated.fechaFin ?? null,
      }).catch((err) =>
        logger.error({ err, turnoId: updated.id }, "[Turnos] notify assign push failed"),
      )
    }

    return updated
  } catch (err: any) {
    if (err?.code === "P2002") {
      auditFail(
        req,
        "turnos.assign.failed",
        "Assign turno failed",
        { reason: "unique_conflict", turnoId, guiaId },
        { entity: "Turno", id: String(turnoId) },
      )
      throw new ConflictError("El guía ya tiene un turno asignado en esta atención")
    }

    throw err
  }
}
