import type { RecaladaSource, StatusType, RecaladaOperativeStatus } from "@prisma/client"

import type { UpdateRecaladaBody } from "../recalada.schemas"

export type CreateRecaladaInput = {
  buqueId: number
  paisOrigenId: number
  fechaLlegada: Date
  fechaSalida?: Date

  terminal?: string
  muelle?: string

  pasajerosEstimados?: number
  tripulacionEstimada?: number

  observaciones?: string
  fuente?: RecaladaSource

  // opcional (si lo quieres permitir desde el inicio)
  status?: StatusType
}

export type UpdateRecaladaInput = UpdateRecaladaBody

export type ListRecaladasResult = {
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
    q?: string
    filters: {
      operationalStatus?: RecaladaOperativeStatus
      buqueId?: number
      paisOrigenId?: number
    }
  }
}