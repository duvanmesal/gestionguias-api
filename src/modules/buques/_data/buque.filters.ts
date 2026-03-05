import type { Prisma } from "@prisma/client"
import type { ListBuqueQuery } from "../buque.schemas"
import { normalizeSearch } from "../_domain/buque.rules"

export function buildBuqueWhere(query: ListBuqueQuery): Prisma.BuqueWhereInput {
  const q = normalizeSearch(query.q)

  return {
    ...(query.status ? { status: query.status } : {}),
    ...(query.paisId ? { paisId: Number(query.paisId) } : {}),
    ...(q
      ? {
          OR: [
            { nombre: { contains: q, mode: "insensitive" } },
            { naviera: { contains: q, mode: "insensitive" } },
            { codigo: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  }
}