import type { Prisma } from "@prisma/client"

export const puertoSelect = {
  id: true,
  codigo: true,
  nombre: true,
  ciudad: true,
  status: true,
  pais: { select: { id: true, codigo: true, nombre: true } },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PuertoSelect

export const puertoLookupSelect = {
  id: true,
  codigo: true,
  nombre: true,
  ciudad: true,
  pais: { select: { id: true, codigo: true, nombre: true } },
} satisfies Prisma.PuertoSelect
