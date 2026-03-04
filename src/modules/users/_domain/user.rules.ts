import type { RolType } from "@prisma/client"

import { BusinessError, UnauthorizedError } from "../../../libs/errors"

export function ensureHasUpdateFields(updateData: Record<string, unknown>) {
  if (Object.keys(updateData).length === 0) {
    throw new BusinessError("No fields to update")
  }
}

export function buildUpdateMeData(data: {
  nombres?: string
  apellidos?: string
  telefono?: string
}) {
  const updateData: Record<string, unknown> = {}
  if (data.nombres !== undefined) updateData.nombres = data.nombres
  if (data.apellidos !== undefined) updateData.apellidos = data.apellidos
  if (data.telefono !== undefined) updateData.telefono = data.telefono
  return updateData
}

export function buildUpdateUserData(args: {
  id: string
  data: {
    nombres?: string
    apellidos?: string
    rol?: RolType
    activo?: boolean
  }
  updatedBy: string
  updaterRole: RolType
}) {
  const updateData: Record<string, unknown> = {}

  if (args.data.nombres !== undefined) updateData.nombres = args.data.nombres
  if (args.data.apellidos !== undefined) updateData.apellidos = args.data.apellidos

  if (args.updaterRole === "SUPER_ADMIN") {
    if (args.data.rol !== undefined) updateData.rol = args.data.rol
    if (args.data.activo !== undefined) updateData.activo = args.data.activo
  } else {
    // Owner only
    if (args.updatedBy !== args.id) {
      throw new UnauthorizedError("You can only update your own profile")
    }

    if (args.data.rol !== undefined || args.data.activo !== undefined) {
      throw new UnauthorizedError("You cannot change role or active status")
    }
  }

  return updateData
}

export function ensureNotSelfDeactivation(userId: string, actorId: string) {
  if (userId === actorId) {
    throw new BusinessError("You cannot deactivate your own account")
  }
}

export function maskDocumentNumber(docNumber: string) {
  const clean = String(docNumber)
  if (clean.length <= 4) return "*".repeat(clean.length)
  return clean.slice(-4).padStart(clean.length, "*")
}