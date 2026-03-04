import type { Request } from "express"

import { NotFoundError } from "../../../libs/errors"
import { logger } from "../../../libs/logger"

import { recaladaRepository } from "../_data/recalada.repository"
import { auditFail, auditOk } from "../_shared/recalada.audit"

export async function getRecaladaAtencionesUsecase(req: Request, recaladaId: number) {
  const recalada = await recaladaRepository.findByIdExists(recaladaId)

  if (!recalada) {
    auditFail(
      req,
      "recaladas.getAtenciones.failed",
      "Get atenciones failed",
      { reason: "recalada_not_found", recaladaId },
      { entity: "Recalada", id: String(recaladaId) },
    )
    throw new NotFoundError("La recalada no existe")
  }

  const items = await recaladaRepository.listAtencionesForRecalada(recaladaId)

  logger.info({ recaladaId, count: items.length }, "[Recaladas] getAtenciones")

  auditOk(
    req,
    "recaladas.getAtenciones",
    "Recalada atenciones",
    { recaladaId, count: items.length },
    { entity: "Recalada", id: String(recaladaId) },
  )

  return items
}