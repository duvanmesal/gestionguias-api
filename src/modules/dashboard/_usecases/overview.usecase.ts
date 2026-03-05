import { RolType, TurnoStatus } from "@prisma/client";

import { ForbiddenError } from "../../../libs/errors";

import type { OverviewQuery } from "../dashboard.schemas";
import type {
  AtencionDisponibleLite,
  DashboardMilestone,
  DashboardOverviewResponse,
  DashboardWidget,
  GuiaOverview,
  SupervisorOverview,
  TurnoLite,
} from "../dashboard.types";

import {
  buildUtcDayRange,
  buildUtcWeekRange,
  toISO,
  toLocalDateString,
  tzHintFromOffset,
} from "../_domain/dashboard.rules";
import { dashboardRepository } from "../_data/dashboard.repository";

type GetOverviewInput = {
  userId: string;
  rol: string;
  query: OverviewQuery;
};

// ✅ Narrowing seguro para Prisma groupBy _count
type CountAllRow = {
  _count?: true | { _all?: number | null } | null | undefined;
};

function countAll(row: CountAllRow): number {
  const c = row._count;
  if (!c || c === true) return 0;
  return c._all ?? 0;
}

export async function getDashboardOverviewUsecase(
  input: GetOverviewInput,
): Promise<DashboardOverviewResponse> {
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
    const supervisor = await buildSupervisorOverview({
      start,
      end,
      now,
      upcomingLimit: input.query.upcomingLimit ?? 8,
    });

    const widgets = buildSupervisorWidgets(supervisor);

    return { ...base, supervisor, widgets };
  }

  if (role === RolType.GUIA) {
    const guia = await buildGuiaOverview({
      usuarioId: input.userId,
      now,
      availableAtencionesLimit: input.query.availableAtencionesLimit ?? 10,
    });

    const widgets = await buildGuiaWidgets({
      guia,
      usuarioId: input.userId,
      date,
      tzOffsetMinutes,
    });

    return { ...base, guia, widgets };
  }

  throw new ForbiddenError("Unsupported role for dashboard overview");
}

// ============================================================================
// Supervisor overview
// ============================================================================

async function buildSupervisorOverview(args: {
  start: Date;
  end: Date;
  now: Date;
  upcomingLimit: number;
}): Promise<SupervisorOverview> {
  const { start, end, now, upcomingLimit } = args;

  const [recaladas, atenciones, turnos] = await Promise.all([
    dashboardRepository.countRecaladasInDay({ start, end }),
    dashboardRepository.countAtencionesIntersectDay({ start, end }),
    dashboardRepository.countTurnosForAtencionesIntersectDay({ start, end }),
  ]);

  const turnosByStatus =
    await dashboardRepository.groupTurnosByStatusIntersectDay({
      start,
      end,
    });

  const breakdown: Record<string, number> = {};
  for (const row of turnosByStatus) {
    breakdown[String(row.status)] = countAll(row);
  }

  const turnosAssigned = breakdown[String(TurnoStatus.ASSIGNED)] ?? 0;
  const turnosAvailable = breakdown[String(TurnoStatus.AVAILABLE)] ?? 0;
  const turnosInProgress = breakdown[String(TurnoStatus.IN_PROGRESS)] ?? 0;
  const turnosDone = breakdown[String(TurnoStatus.COMPLETED)] ?? 0;
  const turnosCanceled = breakdown[String(TurnoStatus.CANCELED)] ?? 0;

  const [guidesActivos, guidesAsignadosRows] = await Promise.all([
    dashboardRepository.countGuidesActivos(),
    dashboardRepository.groupGuidesAsignadosIntersectDay({ start, end }),
  ]);

  const guidesAsignados = guidesAsignadosRows.length;
  const guidesLibres = Math.max(0, guidesActivos - guidesAsignados);

  const takeUpcoming = Math.min(10, upcomingLimit * 2);

  const [nextArrivals, nextDepartures, nextAtencionStarts, nextAtencionEnds] =
    await Promise.all([
      dashboardRepository.listNextArrivals({ now, take: takeUpcoming }),
      dashboardRepository.listNextDepartures({ now, take: takeUpcoming }),
      dashboardRepository.listNextAtencionStarts({ now, take: takeUpcoming }),
      dashboardRepository.listNextAtencionEnds({ now, take: takeUpcoming }),
    ]);

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

  milestones.sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
  );

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

function buildSupervisorWidgets(
  supervisor: SupervisorOverview,
): DashboardWidget[] {
  const widgets: DashboardWidget[] = [];

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
      actions: [
        { label: "Revisar", action: "navigate", to: "/turnos?unassigned=1" },
      ],
    });
  }

  if (supervisor.guides) {
    widgets.push({
      id: "sup-guides",
      type: "kpi",
      tone: "neutral",
      icon: "users",
      title: "Guías hoy",
      subtitle: "Capacidad operativa.",
      data: supervisor.guides,
      actions: [
        {
          label: "Asignar turno",
          action: "navigate",
          to: "/turnos?unassigned=1",
        },
      ],
    });
  }

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

// ============================================================================
// Guia overview
// ============================================================================

async function buildGuiaOverview(args: {
  usuarioId: string;
  now: Date;
  availableAtencionesLimit: number;
}): Promise<GuiaOverview> {
  const { usuarioId, now, availableAtencionesLimit } = args;

  const guia = await dashboardRepository.findGuiaIdByUsuarioId(usuarioId);
  if (!guia) {
    return {
      nextTurno: null,
      activeTurno: null,
      atencionesDisponibles: [],
    };
  }

  const guiaId = guia.id; // ✅ string

  const [activeTurnoRaw, nextTurnoRaw] = await Promise.all([
    dashboardRepository.findActiveTurnoForGuia(guiaId),
    dashboardRepository.findNextTurnoForGuia({ guiaId, now }),
  ]);

  const toTurnoLite = (t: any): TurnoLite => ({
    id: t.id,
    numero: t.numero,
    status: t.status,
    checkInAt: toISO(t.checkInAt),
    checkOutAt: toISO(t.checkOutAt),
    atencion: {
      id: t.atencion.id,
      fechaInicio: t.atencion.fechaInicio.toISOString(),
      fechaFin: t.atencion.fechaFin.toISOString(),
      recalada: {
        id: t.atencion.recalada.id,
        codigoRecalada: t.atencion.recalada.codigoRecalada,
        fechaLlegada: t.atencion.recalada.fechaLlegada.toISOString(),
        fechaSalida: toISO(t.atencion.recalada.fechaSalida),
        operationalStatus: t.atencion.recalada.operationalStatus,
        buque: { nombre: t.atencion.recalada.buque.nombre },
      },
    },
  });

  const activeTurno = activeTurnoRaw ? toTurnoLite(activeTurnoRaw) : null;
  const nextTurno = nextTurnoRaw ? toTurnoLite(nextTurnoRaw) : null;

  const atenciones = await dashboardRepository.listAtencionesDisponibles({
    now,
    take: availableAtencionesLimit,
  });

  const atencionIds = atenciones.map((a) => a.id);
  const availableByAtencion =
    await dashboardRepository.groupAvailableTurnosByAtencion(atencionIds);

  const availableMap = new Map<number, number>();
  for (const row of availableByAtencion) {
    availableMap.set(row.atencionId, countAll(row));
  }

  const atencionesDisponibles: AtencionDisponibleLite[] = atenciones.map(
    (a: any) => ({
      id: a.id,
      fechaInicio: a.fechaInicio.toISOString(),
      fechaFin: a.fechaFin.toISOString(),
      operationalStatus: a.operationalStatus,
      recalada: {
        id: a.recalada.id,
        codigoRecalada: a.recalada.codigoRecalada,
        fechaLlegada: a.recalada.fechaLlegada.toISOString(),
        fechaSalida: toISO(a.recalada.fechaSalida),
        operationalStatus: a.recalada.operationalStatus,
        buque: { nombre: a.recalada.buque.nombre },
      },
      availableTurnos: availableMap.get(a.id) ?? 0,
    }),
  );

  return {
    nextTurno,
    activeTurno,
    atencionesDisponibles,
  };
}

async function buildGuiaWidgets(args: {
  guia: GuiaOverview;
  usuarioId: string;
  date: string;
  tzOffsetMinutes: number;
}): Promise<DashboardWidget[]> {
  const { guia, usuarioId, date, tzOffsetMinutes } = args;

  const widgets: DashboardWidget[] = [];

  if (guia.activeTurno) {
    widgets.push({
      id: "guia-active-turno",
      type: "cta",
      tone: "success",
      icon: "play",
      title: "Turno en curso",
      subtitle: "Continúa donde lo dejaste.",
      data: { turnoId: guia.activeTurno.id },
      actions: [
        {
          label: "Continuar",
          action: "navigate",
          to: `/turnos/${guia.activeTurno.id}`,
        },
      ],
    });
  }

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
      actions: [
        { label: "Ver detalles", action: "navigate", to: `/turnos/${t.id}` },
      ],
    });
  }

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

  const guiaRow = await dashboardRepository.findGuiaIdByUsuarioId(usuarioId);
  if (guiaRow) {
    const { start, end } = buildUtcWeekRange(date, tzOffsetMinutes);
    const weekBreakdown = await dashboardRepository.groupGuiaWeekTurnosByStatus(
      {
        guiaId: guiaRow.id, // ✅ string
        start,
        end,
      },
    );

    const map: Record<string, number> = {};
    for (const row of weekBreakdown) map[String(row.status)] = countAll(row);

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
