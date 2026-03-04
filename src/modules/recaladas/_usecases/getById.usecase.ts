import type { Request } from "express"

import { NotFoundError } from "../../../libs/errors"
import { logger } from "../../../libs/logger"

import { recaladaRepository } from "../_data/recalada.repository"
import { auditFail, auditOk } from "../_shared/recalada.audit"

export async function getRecaladaByIdUsecase(req: Request, id: number) {
  const item = await recaladaRepository.findById(id)

  if (!item) {
    auditFail(
      req,
      "recaladas.getById.failed",
      "Get recalada failed",
      { reason: "not_found", recaladaId: id },
      { entity: "Recalada", id: String(id) },
    )
    throw new NotFoundError("La recalada no existe")
  }

  logger.info({ recaladaId: id }, "[Recaladas] getById")

  auditOk(
    req,
    "recaladas.getById",
    "Recalada detail",
    {
      recaladaId: id,
      operationalStatus: item.operationalStatus,
      status: item.status,
    },
    { entity: "Recalada", id: String(id) },
  )

  return item
}