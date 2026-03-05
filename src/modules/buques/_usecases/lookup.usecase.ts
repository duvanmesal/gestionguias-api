import { buqueRepository } from "../_data/buque.repository"

export async function lookupBuquesUsecase() {
  return buqueRepository.lookup()
}