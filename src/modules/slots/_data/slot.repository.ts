import type { StatusType } from "@prisma/client"
import { prisma } from "../../../prisma/client"

export class SlotRepository {
  findAll() {
    return prisma.slotOperativo.findMany({
      orderBy: { numero: "asc" },
    })
  }

  findById(id: number) {
    return prisma.slotOperativo.findUnique({ where: { id } })
  }

  findByNumero(numero: number) {
    return prisma.slotOperativo.findUnique({ where: { numero } })
  }

  update(id: number, data: { status: StatusType; motivoInactividad?: string | null }) {
    return prisma.slotOperativo.update({
      where: { id },
      data,
    })
  }
}

export const slotRepository = new SlotRepository()
