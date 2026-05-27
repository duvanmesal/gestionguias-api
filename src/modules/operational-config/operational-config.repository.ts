import { TurnoAssignmentMode } from "@prisma/client"

import { prisma } from "../../prisma/client"

export const OPERATIONAL_CONFIG_ID = "global"

const operationalConfigSelect = {
  id: true,
  turnoAssignmentMode: true,
  noShowPenaltyDurationHours: true,
  updatedById: true,
  createdAt: true,
  updatedAt: true,
} as const

export const operationalConfigRepository = {
  get() {
    return prisma.operationalConfig.upsert({
      where: { id: OPERATIONAL_CONFIG_ID },
      create: { id: OPERATIONAL_CONFIG_ID, turnoAssignmentMode: TurnoAssignmentMode.MANUAL_RECLAMO },
      update: {},
      select: operationalConfigSelect,
    })
  },

  async getTurnoAssignmentMode() {
    const config = await this.get()
    return config.turnoAssignmentMode
  },

  async getNoShowPenaltyDurationHours() {
    const config = await this.get()
    return config.noShowPenaltyDurationHours
  },

  updateTurnoAssignmentMode(mode: TurnoAssignmentMode, updatedById: string) {
    return prisma.operationalConfig.upsert({
      where: { id: OPERATIONAL_CONFIG_ID },
      create: {
        id: OPERATIONAL_CONFIG_ID,
        turnoAssignmentMode: mode,
        updatedById,
      },
      update: {
        turnoAssignmentMode: mode,
        updatedById,
      },
      select: operationalConfigSelect,
    })
  },

  updateNoShowPenaltyDurationHours(durationHours: number, updatedById: string) {
    return prisma.operationalConfig.upsert({
      where: { id: OPERATIONAL_CONFIG_ID },
      create: {
        id: OPERATIONAL_CONFIG_ID,
        noShowPenaltyDurationHours: durationHours,
        updatedById,
      },
      update: {
        noShowPenaltyDurationHours: durationHours,
        updatedById,
      },
      select: operationalConfigSelect,
    })
  },
}
