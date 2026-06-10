import type { StatusType } from "@prisma/client"
import { NotFoundError } from "../../../libs/errors"
import { slotRepository } from "../_data/slot.repository"

export async function toggleSlotUsecase(
  id: number,
  status: StatusType,
  motivoInactividad: string | null | undefined,
) {
  const slot = await slotRepository.findById(id)
  if (!slot) throw new NotFoundError("Slot operativo no encontrado")

  return slotRepository.update(id, {
    status,
    motivoInactividad: status === "ACTIVO" ? null : (motivoInactividad ?? null),
  })
}
