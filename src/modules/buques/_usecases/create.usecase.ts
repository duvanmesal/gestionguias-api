import { BadRequestError } from "../../../libs/errors"
import type { StatusType } from "@prisma/client"
import type { CreateBuqueBody } from "../buque.schemas"
import { buqueRepository } from "../_data/buque.repository"

export async function createBuqueUsecase(body: CreateBuqueBody) {
  if (body.paisId !== undefined) {
    const ok = await buqueRepository.paisExists(body.paisId)
    if (!ok) throw new BadRequestError("El país (paisId) no existe")
  }

  const status: StatusType = body.status ?? "ACTIVO"

  return buqueRepository.create({
    codigo: body.codigo,
    nombre: body.nombre,
    paisId: body.paisId ?? null,
    capacidad: body.capacidad ?? null,
    naviera: body.naviera ?? null,
    status,
  })
}