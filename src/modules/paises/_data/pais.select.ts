import type { Prisma } from "@prisma/client"

export const paisSelect = {
  id: true,
  codigo: true,
  nombre: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PaisSelect

export const paisLookupSelect = {
  id: true,
  codigo: true,
  nombre: true,
} satisfies Prisma.PaisSelect