import type { Prisma } from "@prisma/client"
import type { ListPuertoQuery } from "../puerto.schemas"

export function buildPuertoWhere(query: ListPuertoQuery): Prisma.PuertoWhereInput {
  const q = query.q?.trim()

  return {
    ...(query.status ? { status: query.status } : {}),
    ...(query.paisId ? { paisId: query.paisId } : {}),
    ...(q
      ? {
          OR: [
            { codigo: { contains: q, mode: "insensitive" } },
            { nombre: { contains: q, mode: "insensitive" } },
            { ciudad: { contains: q, mode: "insensitive" } },
            { pais: { nombre: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  }
}
