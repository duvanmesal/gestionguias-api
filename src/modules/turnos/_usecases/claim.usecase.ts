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

export async function claimTurnoUsecase(req: Request, turnoId: number, actorUserId: string) {
  const actorGuiaId = await turnoRepository.getActorGuiaIdOrThrow(actorUserId)

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

  try {
    const updated = await turnoRepository.transaction(async (tx) => {
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