import type { Request } from "express"

import { NotFoundError } from "../../../libs/errors"

import { atencionRepository } from "../_data/atencion.repository"
import { auditFail, auditOk } from "../_shared/atencion.audit"

export async function listTurnosByAtencionUsecase(req: Request, atencionId: number) {
  const atencion = await atencionRepository.findByIdExists(atencionId)
  if (!atencion) {
    auditFail(
      req,
      "atenciones.turnos.list.failed",
      "List turnos failed",
      { reason: "atencion_not_found", atencionId },
      { entity: "Atencion", id: String(atencionId) },
    )
    throw new NotFoundError("Atención no encontrada")
  }

  const items = await atencionRepository.listTurnosByAtencionId(atencionId)

  auditOk(
    req,
    "atenciones.turnos.list",
    "Atencion turnos list",
    { atencionId, count: items.length },
    { entity: "Atencion", id: String(atencionId) },
  )

  // Mantener shape legacy para el front
  return items.map((t) => ({
    id: t.id,
    numero: t.numero,
    status: t.status,
    guiaId: t.guiaId,
    checkInAt: t.checkInAt,
    checkOutAt: t.checkOutAt,
    canceledAt: t.canceledAt,
    guia: t.guia
      ? {
          id: t.guia.id,
          email: t.guia.usuario.email,
          nombres: t.guia.usuario.nombres,
          apellidos: t.guia.usuario.apellidos,
        }
      : null,
  }))
}