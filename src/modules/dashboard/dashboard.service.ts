import { prisma } from "../../prisma/client";
import { ForbiddenError } from "../../libs/errors";
import { RolType, TurnoStatus, StatusType, AtencionOperativeStatus, RecaladaOperativeStatus } from "@prisma/client";
import type { OverviewQuery } from "./dashboard.schemas";
import type {
  DashboardOverviewResponse,
  DashboardMilestone,
  AtencionDisponibleLite,
  TurnoLite,
} from "./dashboard.types";

type GetOverviewInput = {
  userId: string;
  rol: string; // viene del JWT payload
  query: OverviewQuery;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/**
 * Convierte un Date "ahora" a un YYYY-MM-DD del "día local" definido por tzOffsetMinutes.
 */
function toLocalDateString(now: Date, tzOffsetMinutes: number): string {
  // localTime = utcTime + offset
  const localMs = now.getTime() + tzOffsetMinutes * 60_000;
  const d = new Date(localMs);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return `${y}-${pad2(m)}-${pad2(day)}`;
}

/**
 * Dado un YYYY-MM-DD y un offset, construye el rango UTC [start, end)
 * correspondiente al día local.
 */
function buildUtcDayRange(dateStr: string, tzOffsetMinutes: number): { start: Date; end: Date } {
  const [yS, mS, dS] = dateStr.split("-");
  const y = Number(yS);
  const m = Number(mS);
  const d = Number(dS);

  // startLocal = YYYY-MM-DD 00:00:00.000
  // startUtc = startLocal - offset
  const startUtcMs = Date.UTC(y, m - 1, d, 0, 0, 0, 0) - tzOffsetMinutes * 60_000;
  const endUtcMs = Date.UTC(y, m - 1, d + 1, 0, 0, 0, 0) - tzOffsetMinutes * 60_000;

  return { start: new Date(startUtcMs), end: new Date(endUtcMs) };
}

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

export class DashboardService {
  static async getOverview(input: GetOverviewInput): Promise<DashboardOverviewResponse> {
    const role = input.rol as RolType;

    const tzOffsetMinutes = input.query.tzOffsetMinutes ?? -300;
    const now = new Date();

    const date = input.query.date ?? toLocalDateString(now, tzOffsetMinutes);
    const { start, end } = buildUtcDayRange(date, tzOffsetMinutes);

    const base: DashboardOverviewResponse = {
      role,
      date,
      tzOffsetMinutes,
      generatedAt: now.toISOString(),
    };

    if (role === RolType.SUPER_ADMIN || role === RolType.SUPERVISOR) {
      const supervisor = await this.buildSupervisorOverview({
        start,
        end,
        now,
        upcomingLimit: input.query.upcomingLimit ?? 8,
      });

      return { ...base, supervisor };
    }

    if (role === RolType.GUIA) {
      const guia = await this.buildGuiaOverview({
        usuarioId: input.userId,
        now,
        availableAtencionesLimit: input.query.availableAtencionesLimit ?? 10,
      });

      return { ...base, guia };
    }

    throw new ForbiddenError("Unsupported role for dashboard overview");
  }

  private static async buildSupervisorOverview(args: {
    start: Date;
    end: Date;
    now: Date;
    upcomingLimit: number;
  }) {
    const { start, end, now, upcomingLimit } = args;

    // Conteos "del día" (según tzOffsetMinutes)
    const recaladasCountPromise = prisma.recalada.count({
      where: {
        status: StatusType.ACTIVO,
        fechaLlegada: { gte: start, lt: end },
      },
    });

    const atencionesCountPromise = prisma.atencion.count({
      where: {
        status: StatusType.ACTIVO,
        // "interseca el día"
        fechaInicio: { lt: end },
        fechaFin: { gt: start },
      },
    });

    const turnosCountPromise = prisma.turno.count({
      where: {
        atencion: {
          status: StatusType.ACTIVO,
          fechaInicio: { lt: end },
          fechaFin: { gt: start },
        },
      },
    });

    const [recaladas, atenciones, turnos] = await Promise.all([
      recaladasCountPromise,
      atencionesCountPromise,
      turnosCountPromise,
    ]);

    // Próximos hitos
    // 1) Próximas llegadas (SCHEDULED)
    const nextArrivals = await prisma.recalada.findMany({
      where: {
        status: StatusType.ACTIVO,
        operationalStatus: RecaladaOperativeStatus.SCHEDULED,
        fechaLlegada: { gte: now },
      },
      orderBy: { fechaLlegada: "asc" },
      take: Math.min(10, upcomingLimit * 2),
      select: {
        id: true,
        codigoRecalada: true,
        fechaLlegada: true,
        buque: { select: { nombre: true } },
      },
    });

    // 2) Próximas salidas (ARRIVED) usando fechaSalida si existe
    const nextDepartures = await prisma.recalada.findMany({
      where: {
        status: StatusType.ACTIVO,
        operationalStatus: RecaladaOperativeStatus.ARRIVED,
        fechaSalida: { not: null, gte: now },
      },
      orderBy: { fechaSalida: "asc" },
      take: Math.min(10, upcomingLimit * 2),
      select: {
        id: true,
        codigoRecalada: true,
        fechaSalida: true,
        buque: { select: { nombre: true } },
      },
    });

    // 3) Atenciones por cerrar (OPEN)
    const nextAtencionEnds = await prisma.atencion.findMany({
      where: {
        status: StatusType.ACTIVO,
        operationalStatus: AtencionOperativeStatus.OPEN,
        fechaFin: { gte: now },
      },
      orderBy: { fechaFin: "asc" },
      take: Math.min(10, upcomingLimit * 2),
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

    // 4) Atenciones por iniciar (OPEN)
    const nextAtencionStarts = await prisma.atencion.findMany({
      where: {
        status: StatusType.ACTIVO,
        operationalStatus: AtencionOperativeStatus.OPEN,
        fechaInicio: { gte: now },
      },
      orderBy: { fechaInicio: "asc" },
      take: Math.min(10, upcomingLimit * 2),
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

    const milestones: DashboardMilestone[] = [];

    for (const r of nextArrivals) {
      milestones.push({
        kind: "RECALADA_ARRIVAL",
        at: r.fechaLlegada.toISOString(),
        title: `Llegada: ${r.buque.nombre} (${r.codigoRecalada})`,
        ref: { recaladaId: r.id },
      });
    }

    for (const r of nextDepartures) {
      // fechaSalida es non-null por filtro
      milestones.push({
        kind: "RECALADA_DEPARTURE",
        at: (r.fechaSalida as Date).toISOString(),
        title: `Salida: ${r.buque.nombre} (${r.codigoRecalada})`,
        ref: { recaladaId: r.id },
      });
    }

    for (const a of nextAtencionStarts) {
      milestones.push({
        kind: "ATENCION_START",
        at: a.fechaInicio.toISOString(),
        title: `Abre atención #${a.id} (${a.recalada.buque.nombre} - ${a.recalada.codigoRecalada})`,
        ref: { atencionId: a.id, recaladaId: a.recalada.id },
      });
    }

    for (const a of nextAtencionEnds) {
      milestones.push({
        kind: "ATENCION_END",
        at: a.fechaFin.toISOString(),
        title: `Cierra atención #${a.id} (${a.recalada.buque.nombre} - ${a.recalada.codigoRecalada})`,
        ref: { atencionId: a.id, recaladaId: a.recalada.id },
      });
    }

    milestones.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

    return {
      counts: { recaladas, atenciones, turnos },
      upcoming: milestones.slice(0, upcomingLimit),
    };
  }

  private static async buildGuiaOverview(args: {
    usuarioId: string;
    now: Date;
    availableAtencionesLimit: number;
  }) {
    const { usuarioId, now, availableAtencionesLimit } = args;

    // Turno.guiaId apunta a Guia.id, no Usuario.id
    const guia = await prisma.guia.findUnique({
      where: { usuarioId },
      select: { id: true },
    });

    if (!guia) {
      return {
        nextTurno: null,
        activeTurno: null,
        atencionesDisponibles: [],
      };
    }

    const guiaId = guia.id;

    const turnoSelect = {
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

    const activeTurnoRaw = await prisma.turno.findFirst({
      where: {
        guiaId,
        OR: [
          { status: TurnoStatus.IN_PROGRESS },
          {
            // fallback razonable si en tu operación todavía no estás usando IN_PROGRESS
            checkInAt: { not: null },
            checkOutAt: null,
            status: { in: [TurnoStatus.ASSIGNED, TurnoStatus.IN_PROGRESS] },
          },
        ],
      },
      orderBy: { updatedAt: "desc" },
      select: turnoSelect,
    });

    const nextTurnoRaw = await prisma.turno.findFirst({
      where: {
        guiaId,
        status: { in: [TurnoStatus.ASSIGNED, TurnoStatus.IN_PROGRESS] },
        atencion: {
          fechaFin: { gt: now },
        },
      },
      orderBy: {
        atencion: { fechaInicio: "asc" },
      },
      select: turnoSelect,
    });

    const toTurnoLite = (t: any): TurnoLite => ({
      id: t.id,
      numero: t.numero,
      status: t.status,
      checkInAt: iso(t.checkInAt),
      checkOutAt: iso(t.checkOutAt),
      atencion: {
        id: t.atencion.id,
        fechaInicio: t.atencion.fechaInicio.toISOString(),
        fechaFin: t.atencion.fechaFin.toISOString(),
        recalada: {
          id: t.atencion.recalada.id,
          codigoRecalada: t.atencion.recalada.codigoRecalada,
          fechaLlegada: t.atencion.recalada.fechaLlegada.toISOString(),
          fechaSalida: iso(t.atencion.recalada.fechaSalida),
          operationalStatus: t.atencion.recalada.operationalStatus,
          buque: { nombre: t.atencion.recalada.buque.nombre },
        },
      },
    });

    const activeTurno = activeTurnoRaw ? toTurnoLite(activeTurnoRaw) : null;
    const nextTurno = nextTurnoRaw ? toTurnoLite(nextTurnoRaw) : null;

    // Atenciones disponibles = OPEN, no vencidas, con al menos 1 turno AVAILABLE
    const atenciones = await prisma.atencion.findMany({
      where: {
        status: StatusType.ACTIVO,
        operationalStatus: AtencionOperativeStatus.OPEN,
        fechaFin: { gt: now },
        turnos: { some: { status: TurnoStatus.AVAILABLE } },
      },
      orderBy: { fechaInicio: "asc" },
      take: availableAtencionesLimit,
      select: {
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
      },
    });

    const atencionIds = atenciones.map((a) => a.id);

    const availableByAtencion = atencionIds.length
      ? await prisma.turno.groupBy({
          by: ["atencionId"],
          where: {
            atencionId: { in: atencionIds },
            status: TurnoStatus.AVAILABLE,
          },
          _count: { _all: true },
        })
      : [];

    const availableMap = new Map<number, number>();
    for (const row of availableByAtencion) {
      availableMap.set(row.atencionId, row._count._all);
    }

    const atencionesDisponibles: AtencionDisponibleLite[] = atenciones.map((a) => ({
      id: a.id,
      fechaInicio: a.fechaInicio.toISOString(),
      fechaFin: a.fechaFin.toISOString(),
      operationalStatus: a.operationalStatus,
      recalada: {
        id: a.recalada.id,
        codigoRecalada: a.recalada.codigoRecalada,
        fechaLlegada: a.recalada.fechaLlegada.toISOString(),
        fechaSalida: iso(a.recalada.fechaSalida),
        operationalStatus: a.recalada.operationalStatus,
        buque: { nombre: a.recalada.buque.nombre },
      },
      availableTurnos: availableMap.get(a.id) ?? 0,
    }));

    return {
      nextTurno,
      activeTurno,
      atencionesDisponibles,
    };
  }
}
