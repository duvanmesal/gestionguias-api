import type { Prisma } from "@prisma/client"

import type { ListRecaladasQuery } from "../recalada.schemas"

export function normalizePagination(query: Pick<ListRecaladasQuery, "page" | "pageSize">) {
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

export function buildRecaladasWhere(query: ListRecaladasQuery): Prisma.RecaladaWhereInput {
  const where: Prisma.RecaladaWhereInput = {}
  const AND: Prisma.RecaladaWhereInput[] = []

  if (query.operationalStatus) AND.push({ operationalStatus: query.operationalStatus })
  if (query.buqueId) AND.push({ buqueId: query.buqueId })
  if (query.paisOrigenId) AND.push({ paisOrigenId: query.paisOrigenId })

  if (query.from || query.to) {
    const from = query.from
    const to = query.to

    if (to) {
      AND.push({ fechaLlegada: { lte: to } })
    }

    if (from) {
      AND.push({
        OR: [
          { fechaSalida: { gte: from } },
          { fechaSalida: null, fechaLlegada: { gte: from } },
        ],
      })
    }
  }

  if (query.q) {
    const q = query.q.trim()
    if (q !== "") {
      AND.push({
        OR: [
          { codigoRecalada: { contains: q, mode: "insensitive" } },
          { observaciones: { contains: q, mode: "insensitive" } },
          { buque: { nombre: { contains: q, mode: "insensitive" } } },
        ],
      })
    }
  }

  if (AND.length > 0) where.AND = AND

  return where
}