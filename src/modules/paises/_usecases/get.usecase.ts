import { NotFoundError } from "../../../libs/errors"
import { paisRepository } from "../_data/pais.repository"

export async function getPaisUsecase(id: number) {
  const item = await paisRepository.getById(id)
  if (!item) throw new NotFoundError("País no encontrado")
  return item
}