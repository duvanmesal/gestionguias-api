import type { Request } from "express"

import type { ListPendingCheckInsQuery } from "../turno.schemas"

import { turnoRepository } from "../_data/turno.repository"
import { auditOk } from "../_shared/turno.audit"

/**
 * Epica 5 — Listado de check-ins pendientes de confirmación (supervisor).
 */
export async function listPendingCheckInsUsecase(
  req: Request,
  query: ListPendingCheckInsQuery,
) {
  const page = query.page ?? 1
  const pageSize = query.pageSize ?? 20
  const skip = (page - 1) * pageSize

  const [total, items] = await turnoRepository.listPendingCheckIns({
    atencionId: query.atencionId,
    recaladaId: query.recaladaId,
    skip,
    take: pageSize,
  })

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  auditOk(
    req,
    "turnos.checkin.pending.list",
    "Listado check-ins pendientes",
    {
      page,
      pageSize,
      total,
      totalPages,
      filters: {
        atencionId: query.atencionId ?? null,
        recaladaId: query.recaladaId ?? null,
      },
      returned: items.length,
    },
    { entity: "Turno" },
  )

  return { items, meta: { page, pageSize, total, totalPages } }
}
