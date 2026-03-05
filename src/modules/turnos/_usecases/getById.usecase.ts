import type { Request } from "express"

import { NotFoundError } from "../../../libs/errors"

import { turnoRepository } from "../_data/turno.repository"
import { auditFail } from "../_shared/turno.audit"

export async function getTurnoByIdUsecase(req: Request, turnoId: number) {
  const item = await turnoRepository.findById(turnoId)

  if (!item) {
    auditFail(
      req,
      "turnos.getById.failed",
      "Get turno failed",
      { reason: "not_found", turnoId },
      { entity: "Turno", id: String(turnoId) },
    )
    throw new NotFoundError("Turno no encontrado")
  }

  return item
}