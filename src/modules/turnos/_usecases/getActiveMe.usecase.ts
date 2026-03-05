import type { Request } from "express"

import { turnoRepository } from "../_data/turno.repository"
import { auditOk } from "../_shared/turno.audit"

export async function getActiveTurnoMeUsecase(req: Request, actorUserId: string) {
  const actorGuiaId = await turnoRepository.getActorGuiaIdOrThrow(actorUserId)

  const item = await turnoRepository.findActiveForGuia(actorGuiaId)

  auditOk(
    req,
    "turnos.getActiveMe",
    "Get active turno for actor",
    {
      actorUserId,
      actorGuiaId,
      found: !!item,
      turnoId: item?.id ?? null,
    },
    { entity: "Turno", id: item?.id ? String(item.id) : undefined },
  )

  return item ?? null
}