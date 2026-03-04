import type { Platform, RolType } from "@prisma/client"

export interface AuthUserPublic {
  id: string
  email: string
  nombres: string
  apellidos: string
  rol: RolType
  activo: boolean
  emailVerifiedAt: string | null
  createdAt: string
  updatedAt: string
  telefono?: string | null
  documentType?: string | null
  documentNumber?: string | null
}

export interface AuthTokens {
  accessToken: string
  accessTokenExpiresIn: number
  refreshToken?: string
  refreshTokenExpiresAt: string
}

export interface LoginResult {
  user: AuthUserPublic
  tokens: AuthTokens
  session: {
    id: string
    platform: Platform
    createdAt: Date
  }
}

export interface RefreshResult {
  tokens: AuthTokens
  session: {
    id: string
  }
}

export interface SessionInfo {
  id: string
  platform: Platform
  deviceId: string | null
  ip: string | null
  userAgent: string | null
  createdAt: Date
  lastRotatedAt: Date | null
}