import type { StatusType } from "@prisma/client"
import { listSlotsUsecase } from "./_usecases/list.usecase"
import { toggleSlotUsecase } from "./_usecases/toggle.usecase"

export class SlotService {
  static list() {
    return listSlotsUsecase()
  }

  static toggle(id: number, status: StatusType, motivoInactividad?: string | null) {
    return toggleSlotUsecase(id, status, motivoInactividad)
  }
}
