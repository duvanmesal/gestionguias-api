import type { Prisma } from "@prisma/client"

export const buqueSelect = {
  id: true,
  codigo: true,
  nombre: true,
  status: true,
  capacidad: true,
  naviera: true,
  pais: { select: { id: true, codigo: true, nombre: true } },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.BuqueSelect

export const buqueMinimalSelect = {
  id: true,
  codigo: true,
  nombre: true,
  status: true,
  updatedAt: true,
} satisfies Prisma.BuqueSelect

export const buqueLookupSelect = {
  id: true,
  codigo: true,
  nombre: true,
  pais: { select: { id: true, codigo: true } },
} satisfies Prisma.BuqueSelect