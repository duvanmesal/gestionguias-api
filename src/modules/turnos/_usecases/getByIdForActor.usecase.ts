import type { Request } from "express"
import type { RolType } from "@prisma/client"

import { ForbiddenError } from "../../../libs/errors"

import { turnoRepository } from "../_data/turno.repository"
import { auditFail, auditOk } from "../_shared/turno.audit"
import { getTurnoByIdUsecase } from "./getById.usecase"

export async function getTurnoByIdForActorUsecase(
  req: Request,
  turnoId: number,
  actorUserId: string,
  actorRol: RolType,
) {
  const item = await getTurnoByIdUsecase(req, turnoId)

  if (actorRol === "GUIA") {
    const actorGuiaId = await turnoRepository.getActorGuiaIdOrThrow(actorUserId)

    if (item.guiaId !== actorGuiaId) {
      auditFail(
        req,
        "turnos.getById.failed",
        "Forbidden turno access",
        {
          reason: "forbidden",
          turnoId,
          actorUserId,
          actorGuiaId,
        },
        { entity: "Turno", id: String(turnoId) },
      )
      throw new ForbiddenError("No tienes permisos para ver este turno")
    }
  }

  auditOk(
    req,
    "turnos.getById.success",
    "Turno detail",
    {
      turnoId,
      actorUserId,
      actorRol,
      guiaId: item.guiaId,
      atencionId: item.atencionId,
      status: item.status,
    },
    { entity: "Turno", id: String(turnoId) },
  )

  return item
}