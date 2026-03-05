import type { StatusType } from "@prisma/client"
import type { CreatePaisBody } from "../pais.schemas"
import { paisRepository } from "../_data/pais.repository"

export async function createPaisUsecase(body: CreatePaisBody) {
  const status: StatusType = body.status ?? "ACTIVO"

  return paisRepository.create({
    codigo: body.codigo,
    nombre: body.nombre,
    status,
  })
}