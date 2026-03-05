import type { Prisma } from "@prisma/client"

/**
 * Select estándar para respuestas del módulo Turnos.
 * Mantén este objeto como la fuente de verdad para evitar selects duplicados.
 */
export const turnoSelect = {
  id: true,
  atencionId: true,
  guiaId: true,
  numero: true,
  status: true,

  fechaInicio: true,
  fechaFin: true,
  observaciones: true,

  checkInAt: true,
  checkOutAt: true,

  canceledAt: true,
  cancelReason: true,
  canceledById: true,

  createdById: true,
  createdAt: true,
  updatedAt: true,

  guia: {
    select: {
      id: true,
      usuario: {
        select: { id: true, email: true, nombres: true, apellidos: true },
      },
    },
  },

  atencion: {
    select: {
      id: true,
      recaladaId: true,
      status: true,
      operationalStatus: true,
      fechaInicio: true,
      fechaFin: true,
      recalada: {
        select: {
          id: true,
          codigoRecalada: true,
          status: true,
          operationalStatus: true,
        },
      },
    },
  },
} satisfies Prisma.TurnoSelect

/** Payload con el select anterior (tipado fuerte para usar en repos/usecases) */
export type TurnoDetail = Prisma.TurnoGetPayload<{ select: typeof turnoSelect }>