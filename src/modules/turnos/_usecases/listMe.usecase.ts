import type { Request } from "express"

import type { ListTurnosMeQuery } from "../turno.schemas"

import { turnoRepository } from "../_data/turno.repository"
import {
  buildListTurnosMeWhere,
  normalizePagination,
  resolveDateRange,
} from "../_data/turno.filters"
import { auditOk } from "../_shared/turno.audit"

export async function listTurnosMeUsecase(
  req: Request,
  actorUserId: string,
  query: ListTurnosMeQuery,
) {
  const actorGuiaId = await turnoRepository.getActorGuiaIdOrThrow(actorUserId)

  const { page, pageSize, skip, take } = normalizePagination(query)
  const { dateFrom, dateTo } = resolveDateRange(query)

  const where = buildListTurnosMeWhere({ actorGuiaId, query, dateFrom, dateTo })
  const [total, items] = await turnoRepository.listWithCount({ where, skip, take })

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  auditOk(
    req,
    "turnos.listMe",
    "Turnos list for actor",
    {
      actorUserId,
      actorGuiaId,
      page,
      pageSize,
      total,
      totalPages,
      returned: items.length,
    },
    { entity: "Turno" },
  )

  return { items, meta: { page, pageSize, total, totalPages } }
}