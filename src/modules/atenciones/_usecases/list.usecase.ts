import type { Request } from "express"

import type { ListAtencionesQuery } from "../atencion.schemas"
import type { ListAtencionesResult } from "../_domain/atencion.types"

import { atencionRepository } from "../_data/atencion.repository"
import { buildAtencionesWhere, normalizePagination } from "../_data/atencion.filters"
import { toISO } from "../_domain/atencion.rules"
import { auditOk } from "../_shared/atencion.audit"

export async function listAtencionesUsecase(
  req: Request,
  query: ListAtencionesQuery,
): Promise<ListAtencionesResult> {
  const { page, pageSize, skip, take } = normalizePagination(query)
  const where = buildAtencionesWhere(query)

  const [total, rows] = await Promise.all([
    atencionRepository.count(where),
    atencionRepository.list({ where, skip, take }),
  ])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const result: ListAtencionesResult = {
    items: rows,
    meta: {
      page,
      pageSize,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
      from: toISO(query.from),
      to: toISO(query.to),
      filters: {
        recaladaId: query.recaladaId,
        supervisorId: query.supervisorId,
        status: query.status,
        operationalStatus: query.operationalStatus,
      },
    },
  }

  auditOk(
    req,
    "atenciones.list",
    "Atenciones list",
    {
      page,
      pageSize,
      total,
      returned: rows.length,
      from: result.meta.from ?? null,
      to: result.meta.to ?? null,
      filters: result.meta.filters,
    },
    { entity: "Atencion" },
  )

  return result
}