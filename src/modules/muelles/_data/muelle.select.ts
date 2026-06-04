import type { Prisma } from "@prisma/client"

export const muelleSelect = {
  id: true,
  codigo: true,
  nombre: true,
  capacidadCruceros: true,
  status: true,
  puerto: {
    select: {
      id: true,
      codigo: true,
      nombre: true,
      ciudad: true,
      pais: { select: { id: true, codigo: true, nombre: true } },
    },
  },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.MuelleSelect

export const muelleLookupSelect = {
  id: true,
  codigo: true,
  nombre: true,
  capacidadCruceros: true,
  puerto: { select: { id: true, codigo: true, nombre: true } },
} satisfies Prisma.MuelleSelect
