import type { Request } from "express"

import { BadRequestError, NotFoundError } from "../../../libs/errors"
import { logger } from "../../../libs/logger"

import { recaladaRepository } from "../_data/recalada.repository"
import { auditFail, auditOk } from "../_shared/recalada.audit"

export async function deleteRecaladaSafeUsecase(
  req: Request,
  id: number,
  actorUserId: string,
) {
  const current = await recaladaRepository.findByIdForDelete(id)

  if (!current) {
    auditFail(
      req,
      "recaladas.deleteSafe.failed",
      "Delete recalada failed",
      { reason: "not_found", recaladaId: id },
      { entity: "Recalada", id: String(id) },
    )
    throw new NotFoundError("La recalada no existe")
  }

  if (current.operationalStatus !== "SCHEDULED") {
    auditFail(
      req,
      "recaladas.deleteSafe.failed",
      "Delete recalada failed",
      {
        reason: "not_scheduled",
        operationalStatus: current.operationalStatus,
        recaladaId: id,
      },
      { entity: "Recalada", id: String(id) },
    )

    throw new BadRequestError(
      "No se puede eliminar físicamente una recalada que no esté en SCHEDULED. Use cancelación.",
    )
  }

  const atencionesCount = await recaladaRepository.countAtenciones(id)
  if (atencionesCount > 0) {
    auditFail(
      req,
      "recaladas.deleteSafe.failed",
      "Delete recalada failed",
      { reason: "has_atenciones", recaladaId: id, atencionesCount },
      { entity: "Recalada", id: String(id) },
    )

    throw new BadRequestError(
      "No se puede eliminar la recalada porque tiene atenciones asociadas. Use cancelación.",
    )
  }

  const turnosCount = await recaladaRepository.countTurnos(id)
  if (turnosCount > 0) {
    auditFail(
      req,
      "recaladas.deleteSafe.failed",
      "Delete recalada failed",
      { reason: "has_turnos", recaladaId: id, turnosCount },
      { entity: "Recalada", id: String(id) },
    )

    throw new BadRequestError(
      "No se puede eliminar la recalada porque tiene turnos asociados. Use cancelación.",
    )
  }

  await recaladaRepository.delete(id)

  logger.info(
    { recaladaId: id, codigoRecalada: current.codigoRecalada, actorUserId },
    "[Recaladas] deleteSafe",
  )

  auditOk(
    req,
    "recaladas.deleteSafe.success",
    "Recalada deleted",
    { actorUserId, recaladaId: id, codigoRecalada: current.codigoRecalada },
    { entity: "Recalada", id: String(id) },
  )

  return { deleted: true, id }
}