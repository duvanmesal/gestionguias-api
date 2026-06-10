import type { ProfileStatus, RolType } from "@prisma/client"

export type UserOrderByField = "createdAt" | "updatedAt" | "email"
export type OrderDir = "asc" | "desc"

export interface PaginationOptions {
  page?: number
  pageSize?: number
  search?: string
  rol?: RolType
  activo?: boolean

  // filtros
  profileStatus?: ProfileStatus
  createdFrom?: Date
  createdTo?: Date
  updatedFrom?: Date
  updatedTo?: Date

  // ordenamiento
  orderBy?: UserOrderByField
  orderDir?: OrderDir
}

export interface PaginatedResult<T> {
  data: T[]
  meta: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

export type GuideLookupResult = {
  guiaId: string
  usuarioId: string
  nombres: string | null
  apellidos: string | null
  email: string
  telefono: string | null
  documentType: string | null
  documentNumber: string | null
  direccion: string | null
  profileStatus: string | null
  activo: boolean
  disponibleParaTurnos: boolean
  disponibilidadUpdatedAt: Date | null
  pendingPenalty: boolean
  penaltyExpiresAt: Date | null
  penaltyReason: string | null
  createdAt: Date
  updatedAt: Date
}
