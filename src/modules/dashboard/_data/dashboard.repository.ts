import {
  AtencionOperativeStatus,
  RecaladaOperativeStatus,
  RolType,
  StatusType,
  TurnoStatus,
} from "@prisma/client";
// Note: AtencionEvaluation.estadoFinal is typed via Prisma but compared as string for safety.

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

  countGuidesDisponibles() {
    return prisma.guia.count({
      where: {
        disponibleParaTurnos: true,
        pendingPenalty: false,
        usuario: {
          rol: RolType.GUIA,
          activo: true,
        },
      },
    });
  },

  countGuidesPenalizados() {
    return prisma.guia.count({
      where: {
        pendingPenalty: true,
        usuario: {
          rol: RolType.GUIA,
          activo: true,
        },
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

  countOverdueDepartures(args: { now: Date }) {
    return prisma.recalada.count({
      where: {
        status: StatusType.ACTIVO,
        operationalStatus: RecaladaOperativeStatus.ARRIVED,
        fechaSalida: { lt: args.now },
      },
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

  countPendingCheckIns() {
    return prisma.turno.count({
      where: {
        checkInRequestedAt: { not: null },
        checkInConfirmedAt: null,
        checkInRejectedAt: null,
        status: TurnoStatus.ASSIGNED,
      },
    });
  },

  listWeekAtencionesWithTurnos(args: { start: Date; end: Date }) {
    return prisma.atencion.findMany({
      where: {
        status: StatusType.ACTIVO,
        fechaInicio: { lt: args.end },
        fechaFin: { gt: args.start },
      },
      select: {
        id: true,
        fechaInicio: true,
        fechaFin: true,
        turnos: {
          select: { status: true },
        },
      },
    });
  },

  // ── Analytics range queries ────────────────────────────────────────────────

  listNdayAtencionesWithTurnos(args: { start: Date; end: Date }) {
    return prisma.atencion.findMany({
      where: {
        status: StatusType.ACTIVO,
        fechaInicio: { lt: args.end },
        fechaFin: { gt: args.start },
      },
      select: {
        id: true,
        fechaInicio: true,
        fechaFin: true,
        operationalStatus: true,
        turnos: {
          select: {
            status: true,
            checkInConfirmedAt: true,
          },
        },
      },
    });
  },

  async getEvaluationStats(args: { start: Date; end: Date }) {
    const closed = await prisma.atencion.findMany({
      where: {
        status: StatusType.ACTIVO,
        operationalStatus: AtencionOperativeStatus.CLOSED,
        fechaFin: { gte: args.start, lt: args.end },
      },
      select: {
        id: true,
        evaluation: {
          select: { calificacion: true, estadoFinal: true },
        },
      },
    });

    const evaluadas = closed.filter((a) => a.evaluation !== null);
    const dist = { SATISFACTORIA: 0, CON_NOVEDADES: 0, NO_SATISFACTORIA: 0 };
    let totalCal = 0;

    for (const a of evaluadas) {
      if (a.evaluation) {
        const ef = a.evaluation.estadoFinal as string;
        if (ef in dist) dist[ef as keyof typeof dist]++;
        totalCal += a.evaluation.calificacion;
      }
    }

    return {
      atencionesEnRango: closed.length,
      evaluadas: evaluadas.length,
      pendientesEval: closed.length - evaluadas.length,
      avgCalificacion:
        evaluadas.length > 0
          ? Math.round((totalCal / evaluadas.length) * 10) / 10
          : null,
      distribucion: dist,
    };
  },

  countCheckInsRequestedInRange(args: { start: Date; end: Date }) {
    return prisma.turno.count({
      where: { checkInRequestedAt: { gte: args.start, lt: args.end } },
    });
  },

  countCheckInsConfirmedInRange(args: { start: Date; end: Date }) {
    return prisma.turno.count({
      where: { checkInConfirmedAt: { gte: args.start, lt: args.end } },
    });
  },

  countCheckInsRejectedInRange(args: { start: Date; end: Date }) {
    return prisma.turno.count({
      where: { checkInRejectedAt: { gte: args.start, lt: args.end } },
    });
  },

  countOldPendingCheckIns(args: { cutoff: Date }) {
    return prisma.turno.count({
      where: {
        checkInRequestedAt: { not: null, lt: args.cutoff },
        checkInConfirmedAt: null,
        checkInRejectedAt: null,
        status: TurnoStatus.ASSIGNED,
      },
    });
  },

  async getAvgCheckInResponseTimeMin() {
    const resolved = await prisma.turno.findMany({
      where: {
        checkInRequestedAt: { not: null },
        OR: [
          { checkInConfirmedAt: { not: null } },
          { checkInRejectedAt: { not: null } },
        ],
      },
      select: {
        checkInRequestedAt: true,
        checkInConfirmedAt: true,
        checkInRejectedAt: true,
      },
      take: 500,
    });

    if (!resolved.length) return null;

    let totalMs = 0;
    let count = 0;
    for (const t of resolved) {
      const resolvedAt = t.checkInConfirmedAt ?? t.checkInRejectedAt;
      if (t.checkInRequestedAt && resolvedAt) {
        const diff = resolvedAt.getTime() - t.checkInRequestedAt.getTime();
        if (diff >= 0) { totalMs += diff; count++; }
      }
    }

    return count > 0
      ? Math.round((totalMs / count / 60_000) * 10) / 10
      : null;
  },

  // =====================
  // Guia
  // =====================
  findGuiaIdByUsuarioId(usuarioId: string) {
    return prisma.guia.findUnique({
      where: { usuarioId },
      select: {
        id: true,
        disponibleParaTurnos: true,
        disponibilidadUpdatedAt: true,
        pendingPenalty: true,
      },
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
