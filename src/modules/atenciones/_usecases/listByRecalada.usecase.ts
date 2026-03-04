import type { Request } from "express"

import { NotFoundError } from "../../../libs/errors"

import { atencionRepository } from "../_data/atencion.repository"
import { auditFail, auditOk } from "../_shared/atencion.audit"

export async function listAtencionesByRecaladaUsecase(req: Request, recaladaId: number) {
  const recalada = await atencionRepository.findRecaladaBasic(recaladaId)
  if (!recalada) {
    auditFail(
      req,
      "atenciones.listByRecalada.failed",
      "List atenciones by recalada failed",
      { reason: "recalada_not_found", recaladaId },
      { entity: "Recalada", id: String(recaladaId) },
    )
    throw new NotFoundError("Recalada no encontrada")
  }

  const items = await atencionRepository.listByRecaladaId(recaladaId)

  auditOk(
    req,
    "atenciones.listByRecalada",
    "Atenciones by recalada",
    { recaladaId, codigoRecalada: recalada.codigoRecalada, count: items.length },
    { entity: "Recalada", id: String(recaladaId) },
  )

  return items
}