import { prisma } from "../../prisma/client";
import { ForbiddenError } from "../../libs/errors";
import {
  RolType,
  TurnoStatus,
  StatusType,
  AtencionOperativeStatus,
  RecaladaOperativeStatus,
} from "@prisma/client";
import type { OverviewQuery } from "./dashboard.schemas";
import type {
  DashboardOverviewResponse,
  DashboardMilestone,
  DashboardWidget,
  AtencionDisponibleLite,
  TurnoLite,
} from "./dashboard.types";

type GetOverviewInput = {
  userId: string;
  rol: string;
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

function tzHintFromOffset(tzOffsetMinutes: number): string {
  // UI hint only. Si luego quieres iana real, lo puedes pasar desde el front.
  if (tzOffsetMinutes === -300) return "America/Bogota";
  const sign = tzOffsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(tzOffsetMinutes);
  const hh = Math.floor(abs / 60);
  const mm = abs % 60;
  return `UTC${sign}${pad2(hh)}:${pad2(mm)}`;
}

function buildUtcWeekRange(dateStr: string, tzOffsetMinutes: number): { start: Date; end: Date } {
  const [yS, mS, dS] = dateStr.split("-");
  const y = Number(yS);
  const m = Number(mS);
  const d = Number(dS);

  // dayOfWeek for the local date (0 Sun..6 Sat)
  const dow = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0)).getUTCDay();
  // Monday-start week
  const offsetToMonday = (dow + 6) % 7;
  const mondayUtcMs =
    Date.UTC(y, m - 1, d - offsetToMonday, 0, 0, 0, 0) - tzOffsetMinutes * 60_000;
  const endUtcMs = mondayUtcMs + 7 * 24 * 60 * 60 * 1000;
  return { start: new Date(mondayUtcMs), end: new Date(endUtcMs) };
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

      serverTime: now.toISOString(),
      dateContext: {
        date,
        timezoneHint: tzHintFromOffset(tzOffsetMinutes),
      },
      widgets: [],
    };

    if (role === RolType.SUPER_ADMIN || role === RolType.SUPERVISOR) {
      const supervisor = await this.buildSupervisorOverview({
        start,
        end,
        now,
        upcomingLimit: input.query.upcomingLimit ?? 8,
      });

      const widgets = await this.buildSupervisorWidgets({
        supervisor,
        start,
        end,
      });

      return { ...base, supervisor, widgets };
    }

    if (role === RolType.GUIA) {
      const guia = await this.buildGuiaOverview({
        usuarioId: input.userId,
        now,
        availableAtencionesLimit: input.query.availableAtencionesLimit ?? 10,
      });

      const widgets = await this.buildGuiaWidgets({
        guia,
        usuarioId: input.userId,
        now,
        date,
        tzOffsetMinutes,
      });

      return { ...base, guia, widgets };
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

    // Breakdown de turnos por status (para widgets)
    const turnosByStatus = await prisma.turno.groupBy({
      by: ["status"],
      where: {
        atencion: {
          status: StatusType.ACTIVO,
          fechaInicio: { lt: end },
          fechaFin: { gt: start },
        },
      },
      _count: { _all: true },
    });

    const breakdown: Record<string, number> = {};
    for (const row of turnosByStatus) {
      breakdown[String(row.status)] = row._count._all;
    }

    const turnosAssigned = breakdown[String(TurnoStatus.ASSIGNED)] ?? 0;
    const turnosAvailable = breakdown[String(TurnoStatus.AVAILABLE)] ?? 0;
    const turnosInProgress = breakdown[String(TurnoStatus.IN_PROGRESS)] ?? 0;
    const turnosDone = breakdown[String(TurnoStatus.COMPLETED)] ?? 0;
    const turnosCanceled = breakdown[String(TurnoStatus.CANCELED)] ?? 0;

    // Guías activos y asignados hoy
    const guidesActivosPromise = prisma.usuario.count({
      where: {
        rol: RolType.GUIA,
        activo: true,
      },
    });

    const guidesAsignadosPromise = prisma.turno.groupBy({
      by: ["guiaId"],
      where: {
        guiaId: { not: null },
        status: { in: [TurnoStatus.ASSIGNED, TurnoStatus.IN_PROGRESS] },
        atencion: {
          status: StatusType.ACTIVO,
          fechaInicio: { lt: end },
          fechaFin: { gt: start },
        },
      },
      _count: { _all: true },
    });

    const [guidesActivos, guidesAsignadosRows] = await Promise.all([
      guidesActivosPromise,
      guidesAsignadosPromise,
    ]);

    const guidesAsignados = guidesAsignadosRows.length;
    const guidesLibres = Math.max(0, guidesActivos - guidesAsignados);

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
      counts: {
        recaladas,
        atenciones,
        turnos,
        turnosAssigned,
        turnosAvailable,
        turnosInProgress,
        turnosDone,
        turnosCanceled,
      },
      guides: {
        activos: guidesActivos,
        asignados: guidesAsignados,
        libres: guidesLibres,
      },
      turnosBreakdown: breakdown,
      upcoming: milestones.slice(0, upcomingLimit),
    };
  }

  private static async buildSupervisorWidgets(args: {
    supervisor: Awaited<ReturnType<typeof DashboardService.buildSupervisorOverview>>;
    start: Date;
    end: Date;
  }): Promise<DashboardWidget[]> {
    const { supervisor } = args;

    const widgets: DashboardWidget[] = [];

    // 1) Operación de hoy (KPI)
    widgets.push({
      id: "sup-operation-today",
      type: "kpi",
      tone: "info",
      icon: "radar",
      title: "Operación de hoy",
      subtitle: "Vista rápida del puerto.",
      data: {
        recaladasHoy: supervisor.counts.recaladas,
        atencionesHoy: supervisor.counts.atenciones,
        turnosTotal: supervisor.counts.turnos,
        turnosAsignados: supervisor.counts.turnosAssigned ?? 0,
        turnosDisponibles: supervisor.counts.turnosAvailable ?? 0,
        turnosEnCurso: supervisor.counts.turnosInProgress ?? 0,
      },
      actions: [{ label: "Ver turnero", action: "navigate", to: "/turnos" }],
    });

    // 2) Alertas operativas (solo si aplica)
    const available = supervisor.counts.turnosAvailable ?? 0;
    const canceled = supervisor.counts.turnosCanceled ?? 0;

    const alerts: Array<{ code: string; label: string; count: number }> = [];
    if (available > 0) {
      alerts.push({
        code: "UNASSIGNED_TURNOS",
        label: `${available} turnos sin asignar`,
        count: available,
      });
    }
    if (canceled > 0) {
      alerts.push({
        code: "CANCELED_TURNOS",
        label: `${canceled} turnos cancelados`,
        count: canceled,
      });
    }

    if (alerts.length) {
      widgets.push({
        id: "sup-alerts",
        type: "alert",
        tone: "warning",
        icon: "alert-triangle",
        title: "Alertas operativas",
        subtitle: "Cosas que necesitan acción.",
        data: { items: alerts },
        actions: [{ label: "Revisar", action: "navigate", to: "/turnos?unassigned=1" }],
      });
    }

    // 3) Guías hoy
    if (supervisor.guides) {
      widgets.push({
        id: "sup-guides",
        type: "kpi",
        tone: "neutral",
        icon: "users",
        title: "Guías hoy",
        subtitle: "Capacidad operativa.",
        data: supervisor.guides,
        actions: [{ label: "Asignar turno", action: "navigate", to: "/turnos?unassigned=1" }],
      });
    }

    // 4) Próximos hitos
    if (supervisor.upcoming?.length) {
      widgets.push({
        id: "sup-upcoming",
        type: "list",
        tone: "neutral",
        icon: "calendar-clock",
        title: "Próximos hitos",
        subtitle: "Lo que viene en camino.",
        data: {
          items: supervisor.upcoming.map((m) => ({
            kind: m.kind,
            at: m.at,
            title: m.title,
            ref: m.ref,
          })),
        },
      });
    }

    return widgets;
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

  private static async buildGuiaWidgets(args: {
    guia: Awaited<ReturnType<typeof DashboardService.buildGuiaOverview>>;
    usuarioId: string;
    now: Date;
    date: string;
    tzOffsetMinutes: number;
  }): Promise<DashboardWidget[]> {
    const { guia, usuarioId, date, tzOffsetMinutes } = args;

    const widgets: DashboardWidget[] = [];

    // 1) Turno activo (si existe)
    if (guia.activeTurno) {
      widgets.push({
        id: "guia-active-turno",
        type: "cta",
        tone: "success",
        icon: "play",
        title: "Turno en curso",
        subtitle: "Continúa donde lo dejaste.",
        data: { turnoId: guia.activeTurno.id },
        actions: [{ label: "Continuar", action: "navigate", to: `/turnos/${guia.activeTurno.id}` }],
      });
    }

    // 2) Próximo turno
    if (guia.nextTurno) {
      const t = guia.nextTurno;
      widgets.push({
        id: "guia-next-turno",
        type: "card",
        tone: "info",
        icon: "ticket",
        title: "Próximo turno",
        subtitle: "Tu siguiente experiencia ya está lista.",
        data: {
          turno: {
            id: t.id,
            numero: t.numero,
            status: t.status,
            fechaInicio: t.atencion.fechaInicio,
            fechaFin: t.atencion.fechaFin,
            recalada: {
              id: t.atencion.recalada.id,
              codigoRecalada: t.atencion.recalada.codigoRecalada,
              buqueNombre: t.atencion.recalada.buque.nombre,
            },
            atencion: { id: t.atencion.id },
          },
        },
        actions: [{ label: "Ver detalles", action: "navigate", to: `/turnos/${t.id}` }],
      });
    }

    // 3) Atenciones disponibles
    if (guia.atencionesDisponibles?.length) {
      widgets.push({
        id: "guia-disponibles",
        type: "list",
        tone: "neutral",
        icon: "sparkles",
        title: "Turnos disponibles",
        subtitle: "Toma uno antes de que vuelen.",
        data: {
          items: guia.atencionesDisponibles.map((a) => ({
            atencionId: a.id,
            recaladaId: a.recalada.id,
            buqueNombre: a.recalada.buque.nombre,
            codigoRecalada: a.recalada.codigoRecalada,
            fechaInicio: a.fechaInicio,
            fechaFin: a.fechaFin,
            cuposDisponibles: a.availableTurnos,
          })),
        },
        actions: [{ label: "Ver todas", action: "navigate", to: "/atenciones" }],
      });
    }

    // 4) KPI semanal (compacto)
    const guiaRow = await prisma.guia.findUnique({ where: { usuarioId }, select: { id: true } });
    if (guiaRow) {
      const { start, end } = buildUtcWeekRange(date, tzOffsetMinutes);

      const weekBreakdown = await prisma.turno.groupBy({
        by: ["status"],
        where: {
          guiaId: guiaRow.id,
          atencion: {
            fechaInicio: { gte: start, lt: end },
          },
        },
        _count: { _all: true },
      });

      const map: Record<string, number> = {};
      for (const row of weekBreakdown) map[String(row.status)] = row._count._all;

      widgets.push({
        id: "guia-week-kpis",
        type: "kpi",
        tone: "neutral",
        icon: "calendar",
        title: "Tu semana",
        subtitle: "Pequeño mapa de ruta.",
        data: {
          assigned: map[String(TurnoStatus.ASSIGNED)] ?? 0,
          inProgress: map[String(TurnoStatus.IN_PROGRESS)] ?? 0,
          done: map[String(TurnoStatus.COMPLETED)] ?? 0,
          canceled: map[String(TurnoStatus.CANCELED)] ?? 0,
          available: map[String(TurnoStatus.AVAILABLE)] ?? 0,
        },
      });
    }

    // Si no hay nada, al menos una card “vacía” amigable
    if (!widgets.length) {
      widgets.push({
        id: "guia-empty",
        type: "card",
        tone: "neutral",
        icon: "info",
        title: "Sin novedades",
        subtitle: "Aún no tienes turnos ni atenciones disponibles.",
        actions: [{ label: "Ver mis turnos", action: "navigate", to: "/turnos" }],
      });
    }

    return widgets;
  }
}
