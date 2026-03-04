import { RolType } from "@prisma/client"

import type { ListGuidesQuery } from "../user.schemas"
import type { GuideLookupResult } from "../_domain/user.types"
import { userRepository } from "../_data/user.repository"

export async function listGuidesLookupUsecase(query: ListGuidesQuery): Promise<GuideLookupResult[]> {
  const activo = typeof (query as any).activo === "boolean" ? (query as any).activo : true
  const q = (query.search ?? "").trim()

  const whereUser: any = {
    rol: RolType.GUIA,
    ...(typeof activo === "boolean" ? { activo } : {}),
    ...(q
      ? {
          OR: [
            { nombres: { contains: q, mode: "insensitive" } },
            { apellidos: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  }

  const rows = await userRepository.listGuidesLookup({ whereUser, take: 500 })

  return rows.map((g: any) => ({
    guiaId: g.id,
    nombres: g.usuario.nombres,
    apellidos: g.usuario.apellidos,
    email: g.usuario.email,
    activo: g.usuario.activo,
  }))
}