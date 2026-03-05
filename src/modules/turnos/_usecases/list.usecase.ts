import type { Request } from "express"

import type { ListTurnosQuery } from "../turno.schemas"

import { turnoRepository } from "../_data/turno.repository"
import {
  buildListTurnosWhere,
  normalizePagination,
  resolveDateRange,
} from "../_data/turno.filters"
import { auditOk } from "../_shared/turno.audit"

export async function listTurnosUsecase(req: Request, query: ListTurnosQuery) {
  const { page, pageSize, skip, take } = normalizePagination(query)
  const { dateFrom, dateTo } = resolveDateRange(query)

  const where = buildListTurnosWhere({ query, dateFrom, dateTo })
  const [total, items] = await turnoRepository.listWithCount({ where, skip, take })

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  auditOk(
    req,
    "turnos.list",
    "Turnos list",
    {
      page,
      pageSize,
      total,
      totalPages,
      filters: {
        atencionId: query.atencionId ?? null,
        recaladaId: query.recaladaId ?? null,
        status: query.status ?? null,
        guiaId: query.guiaId ?? null,
        assigned: typeof query.assigned === "boolean" ? query.assigned : null,
        dateFrom: dateFrom ? dateFrom.toISOString() : null,
        dateTo: dateTo ? dateTo.toISOString() : null,
      },
      returned: items.length,
    },
    { entity: "Turno" },
  )

  return { items, meta: { page, pageSize, total, totalPages } }
}