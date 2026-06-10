import { slotRepository } from "../_data/slot.repository"

export async function listSlotsUsecase() {
  return slotRepository.findAll()
}
