import { NotFoundError } from "../../../libs/errors"
import { buqueRepository } from "../_data/buque.repository"

export async function removeBuqueUsecase(id: number) {
  const current = await buqueRepository.getMinimalById(id)
  if (!current) throw new NotFoundError("El buque no existe")

  if (current.status === "INACTIVO") return current
  return buqueRepository.setInactive(id)
}