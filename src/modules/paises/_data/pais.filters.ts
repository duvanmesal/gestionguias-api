import type { Prisma } from "@prisma/client"
import type { ListPaisQuery } from "../pais.schemas"
import { normalizeCodigo, normalizeSearch } from "../_domain/pais.rules"

export function buildPaisWhere(query: ListPaisQuery): Prisma.PaisWhereInput {
  const q = normalizeSearch(query.q)
  const codigo = normalizeCodigo(query.codigo)

  return {
    ...(query.status ? { status: query.status } : {}),
    ...(codigo ? { codigo: { equals: codigo } } : {}),
    ...(q
      ? {
          OR: [
            { nombre: { contains: q, mode: "insensitive" } },
            { codigo: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  }
}