import type { StatusType } from "@prisma/client"
import { NotFoundError } from "../../../libs/errors"
import type { UpdatePaisBody } from "../pais.schemas"
import { paisRepository } from "../_data/pais.repository"

export async function updatePaisUsecase(id: number, body: UpdatePaisBody) {
  const exists = await paisRepository.getById(id)
  if (!exists) throw new NotFoundError("País no encontrado")

  const patch: Partial<{ codigo: string; nombre: string; status: StatusType }> = {
    ...(body.codigo !== undefined ? { codigo: body.codigo } : {}),
    ...(body.nombre !== undefined ? { nombre: body.nombre } : {}),
    ...(body.status !== undefined ? { status: body.status } : {}),
  }

  return paisRepository.update(id, patch)
}