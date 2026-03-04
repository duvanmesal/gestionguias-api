import type { Prisma } from "@prisma/client"

// -------------------------
// SELECTS (Prisma)
// -------------------------

export const atencionSelect = {
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

  recalada: {
    select: {
      id: true,
      codigoRecalada: true,
      fechaLlegada: true,
      fechaSalida: true,
      status: true,
      operationalStatus: true,
      buque: { select: { id: true, nombre: true } },
    },
  },
  supervisor: {
    select: {
      id: true,
      usuario: {
        select: { id: true, email: true, nombres: true, apellidos: true },
      },
    },
  },

  // Útil para vista detalle y futuras ediciones
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

export const turnoForAtencionListSelect = {
  id: true,
  numero: true,
  status: true,
  guiaId: true,
  checkInAt: true,
  checkOutAt: true,
  canceledAt: true,
  guia: {
    select: {
      id: true,
      usuario: {
        select: { id: true, email: true, nombres: true, apellidos: true },
      },
    },
  },
} satisfies Prisma.TurnoSelect

export const turnoClaimSelect = {
  id: true,
  atencionId: true,
  numero: true,
  status: true,
  guiaId: true,
  fechaInicio: true,
  fechaFin: true,
  checkInAt: true,
  checkOutAt: true,
  createdAt: true,
  updatedAt: true,
  guia: {
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
} satisfies Prisma.TurnoSelect