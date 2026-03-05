import {
  AtencionOperativeStatus,
  RecaladaOperativeStatus,
  RolType,
  StatusType,
  TurnoStatus,
} from "@prisma/client";

import { prisma } from "../../../prisma/client";

import {
  dashboardAtencionDisponibleSelect,
  dashboardTurnoLiteSelect,
} from "./dashboard.select";

export const dashboardRepository = {
  // =====================
  // Supervisor/Admin
  // =====================
  countRecaladasInDay(args: { start: Date; end: Date }) {
    return prisma.recalada.count({
      where: {
        status: StatusType.ACTIVO,
        fechaLlegada: { gte: args.start, lt: args.end },
      },
    });
  },

  countAtencionesIntersectDay(args: { start: Date; end: Date }) {
    return prisma.atencion.count({
      where: {
        status: StatusType.ACTIVO,
        // "interseca el día"
        fechaInicio: { lt: args.end },
        fechaFin: { gt: args.start },
      },
    });
  },

  countTurnosForAtencionesIntersectDay(args: { start: Date; end: Date }) {
    return prisma.turno.count({
      where: {
        atencion: {
          status: StatusType.ACTIVO,
          fechaInicio: { lt: args.end },
          fechaFin: { gt: args.start },
        },
      },
    });
  },

  groupTurnosByStatusIntersectDay(args: { start: Date; end: Date }) {
    return prisma.turno.groupBy({
      by: ["status"],
      where: {
        atencion: {
          status: StatusType.ACTIVO,
          fechaInicio: { lt: args.end },
          fechaFin: { gt: args.start },
        },
      },
      _count: { _all: true },
    });
  },

  countGuidesActivos() {
    return prisma.usuario.count({
      where: {
        rol: RolType.GUIA,
        activo: true,
      },
    });
  },

  groupGuidesAsignadosIntersectDay(args: { start: Date; end: Date }) {
    return prisma.turno.groupBy({
      by: ["guiaId"],
      where: {
        guiaId: { not: null },
        status: { in: [TurnoStatus.ASSIGNED, TurnoStatus.IN_PROGRESS] },
        atencion: {
          status: StatusType.ACTIVO,
          fechaInicio: { lt: args.end },
          fechaFin: { gt: args.start },
        },
      },
      _count: { _all: true },
    });
  },

  listNextArrivals(args: { now: Date; take: number }) {
    return prisma.recalada.findMany({
      where: {
        status: StatusType.ACTIVO,
        operationalStatus: RecaladaOperativeStatus.SCHEDULED,
        fechaLlegada: { gte: args.now },
      },
      orderBy: { fechaLlegada: "asc" },
      take: args.take,
      select: {
        id: true,
        codigoRecalada: true,
        fechaLlegada: true,
        buque: { select: { nombre: true } },
      },
    });
  },

  listNextDepartures(args: { now: Date; take: number }) {
    return prisma.recalada.findMany({
      where: {
        status: StatusType.ACTIVO,
        operationalStatus: RecaladaOperativeStatus.ARRIVED,
        fechaSalida: { not: null, gte: args.now },
      },
      orderBy: { fechaSalida: "asc" },
      take: args.take,
      select: {
        id: true,
        codigoRecalada: true,
        fechaSalida: true,
        buque: { select: { nombre: true } },
      },
    });
  },

  listNextAtencionEnds(args: { now: Date; take: number }) {
    return prisma.atencion.findMany({
      where: {
        status: StatusType.ACTIVO,
        operationalStatus: AtencionOperativeStatus.OPEN,
        fechaFin: { gte: args.now },
      },
      orderBy: { fechaFin: "asc" },
      take: args.take,
      select: {
        id: true,
        fechaFin: true,
        recalada: {
          select: {
            id: true,
            codigoRecalada: true,
            buque: { select: { nombre: true } },
          },
        },
      },
    });
  },

  listNextAtencionStarts(args: { now: Date; take: number }) {
    return prisma.atencion.findMany({
      where: {
        status: StatusType.ACTIVO,
        operationalStatus: AtencionOperativeStatus.OPEN,
        fechaInicio: { gte: args.now },
      },
      orderBy: { fechaInicio: "asc" },
      take: args.take,
      select: {
        id: true,
        fechaInicio: true,
        recalada: {
          select: {
            id: true,
            codigoRecalada: true,
            buque: { select: { nombre: true } },
          },
        },
      },
    });
  },

  // =====================
  // Guia
  // =====================
  findGuiaIdByUsuarioId(usuarioId: string) {
    return prisma.guia.findUnique({
      where: { usuarioId },
      select: { id: true },
    });
  },

  // ✅ guiaId es String en Prisma
  findActiveTurnoForGuia(guiaId: string) {
    return prisma.turno.findFirst({
      where: {
        guiaId,
        OR: [
          { status: TurnoStatus.IN_PROGRESS },
          {
            checkInAt: { not: null },
            checkOutAt: null,
            status: { in: [TurnoStatus.ASSIGNED, TurnoStatus.IN_PROGRESS] },
          },
        ],
      },
      orderBy: { updatedAt: "desc" },
      select: dashboardTurnoLiteSelect,
    });
  },

  findNextTurnoForGuia(args: { guiaId: string; now: Date }) {
    return prisma.turno.findFirst({
      where: {
        guiaId: args.guiaId,
        status: { in: [TurnoStatus.ASSIGNED, TurnoStatus.IN_PROGRESS] },
        atencion: {
          fechaFin: { gt: args.now },
        },
      },
      orderBy: {
        atencion: { fechaInicio: "asc" },
      },
      select: dashboardTurnoLiteSelect,
    });
  },

  listAtencionesDisponibles(args: { now: Date; take: number }) {
    return prisma.atencion.findMany({
      where: {
        status: StatusType.ACTIVO,
        operationalStatus: AtencionOperativeStatus.OPEN,
        fechaFin: { gt: args.now },
        turnos: { some: { status: TurnoStatus.AVAILABLE } },
      },
      orderBy: { fechaInicio: "asc" },
      take: args.take,
      select: dashboardAtencionDisponibleSelect,
    });
  },

  groupAvailableTurnosByAtencion(atencionIds: number[]) {
    if (!atencionIds.length) return Promise.resolve([]);

    return prisma.turno.groupBy({
      by: ["atencionId"],
      where: {
        atencionId: { in: atencionIds },
        status: TurnoStatus.AVAILABLE,
      },
      _count: { _all: true },
    });
  },

  // ✅ guiaId es String en Prisma
  groupGuiaWeekTurnosByStatus(args: {
    guiaId: string;
    start: Date;
    end: Date;
  }) {
    return prisma.turno.groupBy({
      by: ["status"],
      where: {
        guiaId: args.guiaId,
        atencion: {
          fechaInicio: { gte: args.start, lt: args.end },
        },
      },
      _count: { _all: true },
    });
  },
};
