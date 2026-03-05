import type { StatusType } from "@prisma/client"
import { BadRequestError, NotFoundError } from "../../../libs/errors"
import type { UpdateBuqueBody } from "../buque.schemas"
import { buqueRepository } from "../_data/buque.repository"

export async function updateBuqueUsecase(id: number, body: UpdateBuqueBody) {
  const exists = await buqueRepository.getById(id)
  if (!exists) throw new NotFoundError("Buque no encontrado")

  if (body.paisId !== undefined) {
    const ok = await buqueRepository.paisExists(body.paisId)
    if (!ok) throw new BadRequestError("El país (paisId) no existe")
  }

  const patch: Partial<{
    codigo: string
    nombre: string
    paisId: number | null
    capacidad: number | null
    naviera: string | null
    status: StatusType
  }> = {
    ...(body.codigo !== undefined ? { codigo: body.codigo } : {}),
    ...(body.nombre !== undefined ? { nombre: body.nombre } : {}),
    ...(body.paisId !== undefined ? { paisId: body.paisId } : {}),
    ...(body.capacidad !== undefined ? { capacidad: body.capacidad } : {}),
    ...(body.naviera !== undefined ? { naviera: body.naviera } : {}),
    ...(body.status !== undefined ? { status: body.status } : {}),
  }

  return buqueRepository.update(id, patch)
}