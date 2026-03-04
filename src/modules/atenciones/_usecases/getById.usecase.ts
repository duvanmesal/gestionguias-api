import type { Request } from "express"

import { NotFoundError } from "../../../libs/errors"

import { atencionRepository } from "../_data/atencion.repository"
import { auditFail, auditOk } from "../_shared/atencion.audit"

export async function getAtencionByIdUsecase(req: Request, id: number) {
  const item = await atencionRepository.findById(id)

  if (!item) {
    auditFail(
      req,
      "atenciones.getById.failed",
      "Get atencion failed",
      { reason: "not_found", atencionId: id },
      { entity: "Atencion", id: String(id) },
    )
    throw new NotFoundError("Atención no encontrada")
  }

  auditOk(
    req,
    "atenciones.getById",
    "Atencion detail",
    {
      atencionId: id,
      recaladaId: item.recaladaId,
      operationalStatus: item.operationalStatus,
      status: item.status,
    },
    { entity: "Atencion", id: String(id) },
  )

  return item
}