import type { Prisma } from "@prisma/client"

import type { ListAtencionesQuery } from "../atencion.schemas"

export function normalizePagination(query: Pick<ListAtencionesQuery, "page" | "pageSize">) {
  const rawPage = Number(query.page ?? 1)
  const rawPageSize = Number(query.pageSize ?? 20)

  const MIN_PAGE_SIZE = 1
  const MAX_PAGE_SIZE = 100

  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1

  const pageSizeClampedBase =
    Number.isFinite(rawPageSize) && rawPageSize > 0 ? Math.floor(rawPageSize) : 20

  const pageSize = Math.min(Math.max(pageSizeClampedBase, MIN_PAGE_SIZE), MAX_PAGE_SIZE)

  const skip = (page - 1) * pageSize
  const take = pageSize

  return { page, pageSize, skip, take }
}

export function buildAtencionesWhere(query: ListAtencionesQuery): Prisma.AtencionWhereInput {
  const where: Prisma.AtencionWhereInput = {}
  const AND: Prisma.AtencionWhereInput[] = []

  if (query.recaladaId) AND.push({ recaladaId: query.recaladaId })
  if (query.supervisorId) AND.push({ supervisorId: query.supervisorId })
  if (query.status) AND.push({ status: query.status })
  if (query.operationalStatus) AND.push({ operationalStatus: query.operationalStatus })

  if (query.from || query.to) {
    const from = query.from
    const to = query.to

    // Ventana que se cruce con [from..to]
    if (from && to) {
      AND.push({ fechaFin: { gte: from } })
      AND.push({ fechaInicio: { lte: to } })
    } else if (from) {
      AND.push({ fechaFin: { gte: from } })
    } else if (to) {
      AND.push({ fechaInicio: { lte: to } })
    }
  }

  if (AND.length > 0) where.AND = AND

  return where
}