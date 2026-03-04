import type { Request } from "express"

import { logger } from "../../../libs/logger"

import { recaladaRepository } from "../_data/recalada.repository"
import { buildRecaladasWhere, normalizePagination } from "../_data/recalada.filters"
import { toISO } from "../_domain/recalada.rules"
import type { ListRecaladasResult } from "../_domain/recalada.types"
import type { ListRecaladasQuery } from "../recalada.schemas"
import { auditOk } from "../_shared/recalada.audit"

export async function listRecaladasUsecase(
  req: Request,
  query: ListRecaladasQuery,
): Promise<ListRecaladasResult> {
  const { page, pageSize, skip, take } = normalizePagination(query)

  const where = buildRecaladasWhere(query)

  const [total, items] = await Promise.all([
    recaladaRepository.count(where),
    recaladaRepository.list({ where, skip, take }),
  ])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const meta = {
    page,
    pageSize,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
    from: toISO(query.from),
    to: toISO(query.to),
    q: query.q,
    filters: {
      operationalStatus: query.operationalStatus,
      buqueId: query.buqueId,
      paisOrigenId: query.paisOrigenId,
    },
  }

  logger.info(
    {
      page,
      pageSize,
      total,
      from: meta.from,
      to: meta.to,
      q: query.q,
      operationalStatus: query.operationalStatus,
      buqueId: query.buqueId,
      paisOrigenId: query.paisOrigenId,
    },
    "[Recaladas] list",
  )

  auditOk(
    req,
    "recaladas.list",
    "Recaladas list",
    {
      page,
      pageSize,
      total,
      from: meta.from,
      to: meta.to,
      q: query.q ?? null,
      filters: meta.filters,
      returned: items.length,
    },
    { entity: "Recalada" },
  )

  return { items, meta }
}