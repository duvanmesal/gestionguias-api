import type { Request } from "express"

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
import { disponibilidadRepository } from "../../disponibilidad/disponibilidad.repository"
import { autoAssignNextInQueue } from "../../disponibilidad/_usecases/autoAssign.usecase"
import { socketService } from "../../../core/socket/socket.service"

export async function noShowTurnoUsecase(
  req: Request,
  turnoId: number,
  reason: string | undefined,
  actorUserId: string,
) {
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

  const extra = buildNoShowObservacion(reason)
  const mergedObs = current.observaciones?.trim()
    ? `${current.observaciones.trim()} | ${extra}`
    : extra

  const updated = await turnoRepository.transaction(async (tx) => {
    const result = await turnoRepository.noShowIfStillAssigned({ turnoId, mergedObs }, tx)

    if (result.count !== 1) {
      throw new ConflictError("No fue posible marcar NO_SHOW: el turno ya no cumple condiciones")
    }

    return turnoRepository.findById(turnoId, tx)
  })

  if (!updated) throw new BadRequestError("No fue posible marcar NO_SHOW")

  logger.info(
    { turnoId, atencionId: updated.atencionId, guiaId: current.guiaId, actorUserId, reason },
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
      reason: reason?.trim() ? reason.trim() : null,
      status: updated.status,
      recaladaId: updated.atencion.recaladaId,
      codigoRecalada: updated.atencion.recalada.codigoRecalada,
    },
    { entity: "Turno", id: String(turnoId) },
  )

  emitTurnoRealtime("turno:noShow", updated)

  // Penalizar al guía ausente y notificarle
  if (current.guiaId) {
    await disponibilidadRepository.setPenalty(current.guiaId)

    const guiaAusente = await turnoRepository.findGuiaById(current.guiaId)
    if (guiaAusente?.usuario?.id) {
      socketService.emitToGuia(guiaAusente.usuario.id, "disponibilidad:penalizado", {
        turnoId,
        atencionId: updated.atencionId,
        mensaje: "Fuiste marcado como NO_SHOW. En la próxima atención irás al final de la cola.",
      })
    }

    // Reasignar al siguiente en cola
    autoAssignNextInQueue(updated.atencionId, turnoId).catch((err) =>
      logger.error({ err, turnoId, atencionId: updated.atencionId }, "[Turnos] error reasignando tras NO_SHOW"),
    )
  }

  return updated
}
