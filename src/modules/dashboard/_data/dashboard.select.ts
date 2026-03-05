/**
 * Selects de Prisma para mantener queries limpias.
 * (No contiene lógica de negocio)
 */

export const dashboardTurnoLiteSelect = {
  id: true,
  numero: true,
  status: true,
  checkInAt: true,
  checkOutAt: true,
  atencion: {
    select: {
      id: true,
      fechaInicio: true,
      fechaFin: true,
      recalada: {
        select: {
          id: true,
          codigoRecalada: true,
          fechaLlegada: true,
          fechaSalida: true,
          operationalStatus: true,
          buque: { select: { nombre: true } },
        },
      },
    },
  },
} as const;

export const dashboardAtencionDisponibleSelect = {
  id: true,
  fechaInicio: true,
  fechaFin: true,
  operationalStatus: true,
  recalada: {
    select: {
      id: true,
      codigoRecalada: true,
      fechaLlegada: true,
      fechaSalida: true,
      operationalStatus: true,
      buque: { select: { nombre: true } },
    },
  },
} as const;
