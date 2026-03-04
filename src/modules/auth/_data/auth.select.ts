export const usuarioForLoginSelect = {
  id: true,
  email: true,
  nombres: true,
  apellidos: true,
  rol: true,
  activo: true,
  passwordHash: true,
  emailVerifiedAt: true,
  createdAt: true,
  updatedAt: true,
  telefono: true,
  documentType: true,
  documentNumber: true,
} as const

export const usuarioPublicSelect = {
  id: true,
  email: true,
  nombres: true,
  apellidos: true,
  rol: true,
  activo: true,
  emailVerifiedAt: true,
  createdAt: true,
  updatedAt: true,
  telefono: true,
  documentType: true,
  documentNumber: true,
} as const

export const sessionListSelect = {
  id: true,
  platform: true,
  deviceId: true,
  ip: true,
  userAgent: true,
  createdAt: true,
  lastRotatedAt: true,
} as const