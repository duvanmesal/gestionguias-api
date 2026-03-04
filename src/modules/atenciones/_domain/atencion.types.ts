import type { AtencionOperativeStatus, StatusType } from "@prisma/client"

export type ListAtencionesResult = {
  items: any[]
  meta: {
    page: number
    pageSize: number
    total: number
    totalPages: number
    hasNextPage: boolean
    hasPrevPage: boolean
    from?: string
    to?: string
    filters: {
      recaladaId?: number
      supervisorId?: string
      status?: StatusType
      operationalStatus?: AtencionOperativeStatus
    }
  }
}

export type AtencionTurnosSummary = {
  turnosTotal: number
  availableCount: number
  assignedCount: number
  inProgressCount: number
  completedCount: number
  canceledCount: number
  noShowCount: number
}