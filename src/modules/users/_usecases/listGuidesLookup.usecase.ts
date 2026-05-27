import { RolType } from "@prisma/client"

import type { ListGuidesQuery } from "../user.schemas"
import type { GuideLookupResult } from "../_domain/user.types"
import { userRepository } from "../_data/user.repository"
import { penaltyService } from "../../penalties/penalty.service"

export async function listGuidesLookupUsecase(query: ListGuidesQuery): Promise<GuideLookupResult[]> {
  const activo = typeof (query as any).activo === "boolean" ? (query as any).activo : true
  const disponible = typeof (query as any).disponible === "boolean" ? (query as any).disponible : undefined
  const penalizado = typeof (query as any).penalizado === "boolean" ? (query as any).penalizado : undefined
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

  const whereGuia: any = {
    ...(typeof disponible === "boolean" ? { disponibleParaTurnos: disponible } : {}),
    ...(typeof penalizado === "boolean" ? { pendingPenalty: penalizado } : {}),
  }

  const rows = await userRepository.listGuidesLookup({ whereUser, whereGuia, take: 500 })

  // Epica 6: traer vigencia de la penalización para los marcados como pendingPenalty.
  const penalizedIds = rows.filter((g: any) => g.pendingPenalty).map((g: any) => g.id)
  const penaltyMap = await penaltyService.mapActiveForGuias(penalizedIds)

  return rows.map((g: any) => {
    const active = penaltyMap.get(g.id) ?? null
    return {
      guiaId: g.id,
      nombres: g.usuario.nombres,
      apellidos: g.usuario.apellidos,
      email: g.usuario.email,
      activo: g.usuario.activo,
      disponibleParaTurnos: g.disponibleParaTurnos,
      disponibilidadUpdatedAt: g.disponibilidadUpdatedAt,
      // Reflejo derivado: si pendingPenalty=true pero no hay vigente, reportar false.
      pendingPenalty: g.pendingPenalty && !!active,
      penaltyExpiresAt: active?.expiresAt ?? null,
      penaltyReason: active?.reason ?? null,
    }
  })
}
