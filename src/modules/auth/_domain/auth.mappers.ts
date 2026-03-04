import type { RolType } from "@prisma/client"
import type { AuthUserPublic } from "./auth.types"

export type UsuarioForPublic = {
  id: string
  email: string
  nombres: string
  apellidos: string
  rol: RolType
  activo: boolean
  emailVerifiedAt: Date | null
  createdAt: Date
  updatedAt: Date
  telefono?: string | null
  documentType?: any
  documentNumber?: string | null
}

export function toIso(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null
}

export function mapUsuarioToAuthUserPublic(user: UsuarioForPublic): AuthUserPublic {
  return {
    id: user.id,
    email: user.email,
    nombres: user.nombres,
    apellidos: user.apellidos,
    rol: user.rol,
    activo: user.activo,
    emailVerifiedAt: toIso(user.emailVerifiedAt),
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    telefono: user.telefono ?? null,
    documentType: user.documentType ?? null,
    documentNumber: user.documentNumber ?? null,
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}