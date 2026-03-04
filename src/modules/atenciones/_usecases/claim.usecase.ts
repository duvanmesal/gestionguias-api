import type { Request } from "express"

import { logger } from "../../../libs/logger"
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "../../../libs/errors"

import { atencionRepository } from "../_data/atencion.repository"
import { assertOperacionPermitida } from "../_domain/atencion.rules"
import { auditFail, auditOk } from "../_shared/atencion.audit"

export async function claimFirstAvailableTurnoUsecase(
  req: Request,
  atencionId: number,
  actorUserId: string,
) {
  const guia = await atencionRepository.findGuiaByUserId(actorUserId)

  if (!guia) {
    auditFail(
      req,
      "atenciones.claim.failed",
      "Claim turno failed",
      { reason: "user_not_guia", atencionId, actorUserId },
      { entity: "Guia" },
    )
    throw new ConflictError("El usuario autenticado no está registrado como guía")
  }

  try {
    const claimed = await atencionRepository.transaction(async (tx) => {
      const atencionGate = await atencionRepository.findGateForClaim(atencionId, tx)
      if (!atencionGate) throw new NotFoundError("Atención no encontrada")

      assertOperacionPermitida({
        atencion: {
          status: atencionGate.status,
          operationalStatus: atencionGate.operationalStatus,
        },
        recalada: {
          status: atencionGate.recalada.status,
          operationalStatus: atencionGate.recalada.operationalStatus,
        },
      })

      const existing = await atencionRepository.findExistingTurnoForGuia(atencionId, guia.id, tx)
      if (existing) {
        throw new ConflictError("Ya tienes un turno asignado en esta atención")
      }

      const maxAttempts = 6

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const candidate = await atencionRepository.findFirstAvailableTurno(atencionId, tx)
        if (!candidate) {
          throw new ConflictError("No hay cupos disponibles para esta atención")
        }

        const updated = await atencionRepository.assignTurnoIfStillAvailable(
          { turnoId: candidate.id, guiaId: guia.id },
          tx,
        )

        if (updated.count === 1) {
          const turno = await atencionRepository.getTurnoClaimDetail(candidate.id, tx)
          if (!turno) throw new BadRequestError("No fue posible completar el claim")
          return turno
        }
      }

      throw new ConflictError(
        "No fue posible tomar cupo: alta concurrencia, intenta de nuevo",
      )
    })

    logger.info(
      { atencionId, actorUserId, guiaId: guia.id, turnoId: claimed.id },
      "[Atenciones] claim turno",
    )

    auditOk(
      req,
      "atenciones.claim.success",
      "Turno claimed",
      {
        atencionId,
        actorUserId,
        guiaId: guia.id,
        turnoId: claimed.id,
        turnoNumero: claimed.numero,
      },
      { entity: "Turno", id: String(claimed.id) },
    )

    return claimed
  } catch (err: any) {
    if (err?.code === "P2002") {
      auditFail(
        req,
        "atenciones.claim.failed",
        "Claim turno failed",
        { reason: "unique_conflict", atencionId, actorUserId, guiaId: guia.id },
        { entity: "Turno" },
      )
      throw new ConflictError("Ya tienes un turno asignado en esta atención")
    }

    auditFail(
      req,
      "atenciones.claim.failed",
      "Claim turno failed",
      {
        reason: "exception",
        atencionId,
        errorName: err?.name,
        errorCode: err?.code,
        message: err?.message,
      },
      { entity: "Turno" },
    )

    throw err
  }
}