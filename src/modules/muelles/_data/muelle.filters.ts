import type { Prisma } from "@prisma/client"
import type { ListMuelleQuery } from "../muelle.schemas"

export function buildMuelleWhere(query: ListMuelleQuery): Prisma.MuelleWhereInput {
  const q = query.q?.trim()

  return {
    ...(query.status ? { status: query.status } : {}),
    ...(query.puertoId ? { puertoId: query.puertoId } : {}),
    ...(q
      ? {
          OR: [
            { codigo: { contains: q, mode: "insensitive" } },
            { nombre: { contains: q, mode: "insensitive" } },
            { puerto: { nombre: { contains: q, mode: "insensitive" } } },
            { puerto: { ciudad: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  }
}
