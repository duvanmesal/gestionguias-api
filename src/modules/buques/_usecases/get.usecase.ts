import { NotFoundError } from "../../../libs/errors"
import { buqueRepository } from "../_data/buque.repository"

export async function getBuqueUsecase(id: number) {
  const item = await buqueRepository.getById(id)
  if (!item) throw new NotFoundError("Buque no encontrado")
  return item
}