import type { Prisma } from "@prisma/client"

export const recaladaSelect = {
  id: true,
  codigoRecalada: true,

  fechaLlegada: true,
  fechaSalida: true,

  // Operación real
  arrivedAt: true,
  departedAt: true,
  canceledAt: true,
  cancelReason: true,

  status: true,
  operationalStatus: true,

  terminal: true,
  muelle: true,
  pasajerosEstimados: true,
  tripulacionEstimada: true,
  observaciones: true,
  fuente: true,

  createdAt: true,
  updatedAt: true,

  buque: { select: { id: true, nombre: true } },
  paisOrigen: { select: { id: true, codigo: true, nombre: true } },
  supervisor: {
    select: {
      id: true,
      usuario: {
        select: {
          id: true,
          email: true,
          nombres: true,
          apellidos: true,
        },
      },
    },
  },
} satisfies Prisma.RecaladaSelect

/**
 * Select de atenciones para el tab dentro del detalle de recalada.
 * Incluye turnos para mostrar cupo ocupado/libre.
 */
export const atencionSelectForRecalada = {
  id: true,
  recaladaId: true,
  supervisorId: true,

  turnosTotal: true,
  descripcion: true,

  fechaInicio: true,
  fechaFin: true,

  status: true,
  operationalStatus: true,

  createdById: true,
  canceledAt: true,
  cancelReason: true,
  canceledById: true,

  createdAt: true,
  updatedAt: true,

  supervisor: {
    select: {
      id: true,
      usuario: {
        select: { id: true, email: true, nombres: true, apellidos: true },
      },
    },
  },

  turnos: {
    select: {
      id: true,
      numero: true,
      status: true,
      guiaId: true,
      fechaInicio: true,
      fechaFin: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { numero: "asc" as const },
  },
} satisfies Prisma.AtencionSelect