import { paisRepository } from "../_data/pais.repository"

export async function lookupPaisesUsecase() {
  return paisRepository.lookup()
}