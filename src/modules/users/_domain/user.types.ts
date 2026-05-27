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
  nombres: string
  apellidos: string
  email: string
  activo: boolean
  disponibleParaTurnos: boolean
  disponibilidadUpdatedAt: Date | null
  pendingPenalty: boolean
  /** Epica 6: expiración de la penalización vigente (null si no hay). */
  penaltyExpiresAt: Date | null
  /** Epica 6: motivo de la penalización vigente (null si no hay). */
  penaltyReason: string | null
}
