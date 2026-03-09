import type { Prisma } from "@prisma/client"

// -------------------------
// SELECTS (Prisma)
// -------------------------

export const userMeSelect = {
  id: true,
  email: true,
  nombres: true,
  apellidos: true,
  telefono: true,
  rol: true,
  activo: true,
  emailVerifiedAt: true,
  profileStatus: true,
  profileCompletedAt: true,
  documentType: true,
  documentNumber: true,
  createdAt: true,
  updatedAt: true,
  guia: {
    select: {
      id: true,
      telefono: true,
      direccion: true,
    },
  },
  supervisor: {
    select: {
      id: true,
      telefono: true,
    },
  },
} satisfies Prisma.UsuarioSelect;

export const userDetailSelect = {
  id: true,
  email: true,
  nombres: true,
  apellidos: true,
  rol: true,
  activo: true,
  createdAt: true,
  updatedAt: true,
  guia: {
    select: {
      id: true,
      telefono: true,
      direccion: true,
    },
  },
  supervisor: {
    select: {
      id: true,
      telefono: true,
    },
  },
} satisfies Prisma.UsuarioSelect

export const userListSelect = {
  id: true,
  email: true,
  nombres: true,
  apellidos: true,
  rol: true,
  activo: true,
  profileStatus: true,
  createdAt: true,
  updatedAt: true,
  guia: { select: { id: true } },
  supervisor: { select: { id: true } },
} satisfies Prisma.UsuarioSelect

export const userAdminSelect = {
  id: true,
  email: true,
  nombres: true,
  apellidos: true,
  telefono: true,
  rol: true,
  activo: true,
  profileStatus: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UsuarioSelect

export const userCreateSelect = {
  id: true,
  email: true,
  nombres: true,
  apellidos: true,
  rol: true,
  activo: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UsuarioSelect

export const userUpdateSelect = userCreateSelect

export const userUpdateMeSelect = {
  id: true,
  email: true,
  nombres: true,
  apellidos: true,
  telefono: true,
  rol: true,
  activo: true,
  profileStatus: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UsuarioSelect

export const userCompleteProfileSelect = {
  id: true,
  email: true,
  nombres: true,
  apellidos: true,
  rol: true,
  activo: true,
  profileStatus: true,
  profileCompletedAt: true,
  documentType: true,
  telefono: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UsuarioSelect