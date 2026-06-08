import { RolType, TurnoAssignmentMode, TurnoStatus } from "@prisma/client";

import { ForbiddenError } from "../../../libs/errors";

import type { OverviewQuery } from "../dashboard.schemas";
import type {
  AtencionDisponibleLite,
  DashboardMilestone,
  DashboardOverviewResponse,
  DashboardWidget,
  GuiaOverview,
  SupervisorAlert,
  SupervisorAnalytics,
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
import { operationalConfigService } from "../../operational-config/operational-config.service";

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
  // Prisma groupBy habla como rarito, aqui le hacemos traduccion simultanea.
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
  const operationalConfig = await operationalConfigService.get();

  const base: DashboardOverviewResponse = {
    role,
    turnoAssignmentMode: operationalConfig.turnoAssignmentMode,
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
    // Vista supervisor: tablero de mando o tablero de "que paso ahora".
    const supervisor = await buildSupervisorOverview({
      start,
      end,
      now,
      upcomingLimit: input.query.upcomingLimit ?? 8,
      tzOffsetMinutes,
      rangeDays: input.query.rangeDays ?? 30,
    });

    const widgets = buildSupervisorWidgets(supervisor);

    return { ...base, supervisor, widgets };
  }

  if (role === RolType.GUIA) {
    // Vista guia: lo minimo para saber si correr, esperar o reclamar turno.
    const guia = await buildGuiaOverview({
      usuarioId: input.userId,
      now,
      availableAtencionesLimit: input.query.availableAtencionesLimit ?? 10,
      assignmentMode: operationalConfig.turnoAssignmentMode,
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
  tzOffsetMinutes: number;
  rangeDays: number;
}): Promise<SupervisorOverview> {
  const { start, end, now, upcomingLimit, tzOffsetMinutes, rangeDays } = args;

  // Build 7-day rolling window for trend (today-6 .. today)
  const trendDayMeta: Array<{ dateStr: string; dayStart: Date; dayEnd: Date }> =
    [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const dateStr = toLocalDateString(d, tzOffsetMinutes);
    const { start: dayStart, end: dayEnd } = buildUtcDayRange(
      dateStr,
      tzOffsetMinutes,
    );
    trendDayMeta.push({ dateStr, dayStart, dayEnd });
  }
  const trendWindowStart = trendDayMeta[0].dayStart;
  const trendWindowEnd = trendDayMeta[trendDayMeta.length - 1].dayEnd;

  const [
    recaladas,
    atenciones,
    turnos,
    overdueRecaladas,
    pendingCheckIns,
  ] = await Promise.all([
    dashboardRepository.countRecaladasInDay({ start, end }),
    dashboardRepository.countAtencionesIntersectDay({ start, end }),
    dashboardRepository.countTurnosForAtencionesIntersectDay({ start, end }),
    dashboardRepository.countOverdueDepartures({ now }),
    dashboardRepository.countPendingCheckIns(),
  ]);

  const [turnosByStatus, weekAtenciones] = await Promise.all([
    dashboardRepository.groupTurnosByStatusIntersectDay({ start, end }),
    dashboardRepository.listWeekAtencionesWithTurnos({
      start: trendWindowStart,
      end: trendWindowEnd,
    }),
  ]);

  const breakdown: Record<string, number> = {};
  for (const row of turnosByStatus) {
    breakdown[String(row.status)] = countAll(row);
  }

  const turnosAssigned = breakdown[String(TurnoStatus.ASSIGNED)] ?? 0;
  const turnosAvailable = breakdown[String(TurnoStatus.AVAILABLE)] ?? 0;
  const turnosInProgress = breakdown[String(TurnoStatus.IN_PROGRESS)] ?? 0;
  const turnosDone = breakdown[String(TurnoStatus.COMPLETED)] ?? 0;
  const turnosCanceled = breakdown[String(TurnoStatus.CANCELED)] ?? 0;
  const turnosNoShow = breakdown[String(TurnoStatus.NO_SHOW)] ?? 0;

  const [
    [guidesActivos, guidesAsignadosRows],
    [guidesDisponibles, guidesPenalizados],
  ] = await Promise.all([
    Promise.all([
      dashboardRepository.countGuidesActivos(),
      dashboardRepository.groupGuidesAsignadosIntersectDay({ start, end }),
    ]),
    Promise.all([
      dashboardRepository.countGuidesDisponibles(),
      dashboardRepository.countGuidesPenalizados(),
    ]),
  ]);

  const guidesAsignados = guidesAsignadosRows.length;
  const guidesLibres = Math.max(0, guidesActivos - guidesAsignados);
  const guidesNoDisponibles = Math.max(0, guidesActivos - guidesDisponibles);

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

  const alerts: SupervisorAlert[] = [];
  if (overdueRecaladas > 0) {
    alerts.push({
      code: "OVERDUE_RECALADAS",
      label:
        overdueRecaladas === 1
          ? "1 recalada vencida pendiente de zarpe"
          : `${overdueRecaladas} recaladas vencidas pendientes de zarpe`,
      count: overdueRecaladas,
    });
  }

  // ── Rates ────────────────────────────────────────────────────────────────
  const round1 = (n: number) => Math.round(n * 10) / 10;
  const assignedAndInProgress = turnosAssigned + turnosInProgress;
  const closedTotal = turnosDone + turnosCanceled + turnosNoShow;

  const rates = {
    assignmentRate: round1(turnos > 0 ? (assignedAndInProgress / turnos) * 100 : 0),
    executionRate: round1(closedTotal > 0 ? (turnosDone / closedTotal) * 100 : 0),
    noShowRate: round1(closedTotal > 0 ? (turnosNoShow / closedTotal) * 100 : 0),
    guideAvailabilityRate: round1(
      guidesActivos > 0 ? (guidesDisponibles / guidesActivos) * 100 : 0,
    ),
  };

  // ── Pending work ─────────────────────────────────────────────────────────
  const pendingWork = {
    pendingCheckIns,
    overdueRecaladas,
    unresolvedTurnos: turnosAvailable,
  };

  // ── 7-day trend ──────────────────────────────────────────────────────────
  const trend7dDays = trendDayMeta.map(({ dateStr, dayStart, dayEnd }) => {
    const matching = weekAtenciones.filter(
      (a) => a.fechaInicio < dayEnd && a.fechaFin > dayStart,
    );
    let turnoCount = 0;
    let completedCount = 0;
    let noShowCount = 0;
    for (const a of matching) {
      turnoCount += a.turnos.length;
      for (const t of a.turnos) {
        if (t.status === TurnoStatus.COMPLETED) completedCount++;
        else if (t.status === TurnoStatus.NO_SHOW) noShowCount++;
      }
    }
    return {
      date: dateStr,
      atenciones: matching.length,
      turnos: turnoCount,
      completed: completedCount,
      noShows: noShowCount,
    };
  });

  // ── Analytics (range-based) ──────────────────────────────────────────────
  const analytics = await buildSupervisorAnalytics({
    now,
    rangeDays,
    tzOffsetMinutes,
    // pass current-day data for rates/turnoStatus
    breakdown,
    turnos,
    turnosAssigned,
    turnosAvailable,
    turnosInProgress,
    turnosDone,
    turnosCanceled,
    turnosNoShow,
    guidesActivos,
    guidesDisponibles,
    guidesAsignados,
    guidesPenalizados,
    guidesLibres,
    guidesNoDisponibles,
    overdueRecaladas,
    pendingCheckIns,
  });

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
      turnosNoShow,
      overdueRecaladas,
    },
    guides: {
      activos: guidesActivos,
      asignados: guidesAsignados,
      libres: guidesLibres,
      disponibles: guidesDisponibles,
      noDisponibles: guidesNoDisponibles,
      penalizados: guidesPenalizados,
    },
    turnosBreakdown: breakdown,
    alerts,
    upcoming: milestones.slice(0, upcomingLimit),
    pendingWork,
    rates,
    trend7d: { days: trend7dDays },
    analytics,
  };
}

// ─── Analytics builder ────────────────────────────────────────────────────────

async function buildSupervisorAnalytics(args: {
  now: Date;
  rangeDays: number;
  tzOffsetMinutes: number;
  breakdown: Record<string, number>;
  turnos: number;
  turnosAssigned: number;
  turnosAvailable: number;
  turnosInProgress: number;
  turnosDone: number;
  turnosCanceled: number;
  turnosNoShow: number;
  guidesActivos: number;
  guidesDisponibles: number;
  guidesAsignados: number;
  guidesPenalizados: number;
  guidesLibres: number;
  guidesNoDisponibles: number;
  overdueRecaladas: number;
  pendingCheckIns: number;
}): Promise<SupervisorAnalytics> {
  const {
    now, rangeDays, tzOffsetMinutes,
    breakdown, turnos,
    turnosAssigned, turnosAvailable, turnosInProgress,
    turnosDone, turnosCanceled, turnosNoShow,
    guidesActivos, guidesDisponibles, guidesAsignados,
    guidesPenalizados, guidesLibres, guidesNoDisponibles,
    overdueRecaladas, pendingCheckIns,
  } = args;

  const round1 = (n: number) => Math.round(n * 10) / 10;

  // ── Range window ────────────────────────────────────────────────────────────
  const rangeMeta: Array<{ dateStr: string; dayStart: Date; dayEnd: Date }> = [];
  for (let i = rangeDays - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const dateStr = toLocalDateString(d, tzOffsetMinutes);
    const { start: dayStart, end: dayEnd } = buildUtcDayRange(dateStr, tzOffsetMinutes);
    rangeMeta.push({ dateStr, dayStart, dayEnd });
  }
  const rangeStart = rangeMeta[0].dayStart;
  const rangeEnd   = rangeMeta[rangeMeta.length - 1].dayEnd;

  const startDateStr = toLocalDateString(rangeMeta[0].dayStart, tzOffsetMinutes);
  const endDateStr   = toLocalDateString(rangeMeta[rangeMeta.length - 1].dayEnd, tzOffsetMinutes);

  // ── Parallel data fetching ──────────────────────────────────────────────────
  const FIFTEEN_MIN_AGO = new Date(now.getTime() - 15 * 60 * 1000);

  const [
    rangeAtenciones,
    evalStats,
    checkInsRequested,
    checkInsConfirmed,
    checkInsRejected,
    oldPendingCheckIns,
    avgResponseTimeMin,
  ] = await Promise.all([
    dashboardRepository.listNdayAtencionesWithTurnos({ start: rangeStart, end: rangeEnd }),
    dashboardRepository.getEvaluationStats({ start: rangeStart, end: rangeEnd }),
    dashboardRepository.countCheckInsRequestedInRange({ start: rangeStart, end: rangeEnd }),
    dashboardRepository.countCheckInsConfirmedInRange({ start: rangeStart, end: rangeEnd }),
    dashboardRepository.countCheckInsRejectedInRange({ start: rangeStart, end: rangeEnd }),
    dashboardRepository.countOldPendingCheckIns({ cutoff: FIFTEEN_MIN_AGO }),
    dashboardRepository.getAvgCheckInResponseTimeMin(),
  ]);

  // ── Workload trend ──────────────────────────────────────────────────────────
  const workloadTrend = rangeMeta.map(({ dateStr, dayStart, dayEnd }) => {
    const matching = rangeAtenciones.filter(
      (a) => a.fechaInicio < dayEnd && a.fechaFin > dayStart,
    );
    let turnoCount = 0, completedCount = 0, noShowCount = 0, canceledCount = 0, confirmedCount = 0;
    for (const a of matching) {
      turnoCount += a.turnos.length;
      for (const t of a.turnos) {
        if (t.status === TurnoStatus.COMPLETED) completedCount++;
        else if (t.status === TurnoStatus.NO_SHOW) noShowCount++;
        else if (t.status === TurnoStatus.CANCELED) canceledCount++;
        if (t.checkInConfirmedAt && t.checkInConfirmedAt >= dayStart && t.checkInConfirmedAt < dayEnd) {
          confirmedCount++;
        }
      }
    }
    return {
      date: dateStr,
      atenciones: matching.length,
      turnos: turnoCount,
      completed: completedCount,
      noShows: noShowCount,
      canceled: canceledCount,
      checkInsConfirmed: confirmedCount,
    };
  });

  // ── KPIs ───────────────────────────────────────────────────────────────────
  const assignedAndInProgress = turnosAssigned + turnosInProgress;
  const closedTotal = turnosDone + turnosCanceled + turnosNoShow;

  const kpis = {
    assignmentRate:       round1(turnos > 0 ? (assignedAndInProgress / turnos) * 100 : 0),
    executionRate:        round1(closedTotal > 0 ? (turnosDone / closedTotal) * 100 : 0),
    noShowRate:           round1(closedTotal > 0 ? (turnosNoShow / closedTotal) * 100 : 0),
    guideAvailabilityRate: round1(guidesActivos > 0 ? (guidesDisponibles / guidesActivos) * 100 : 0),
    utilizacionRate:      round1(guidesActivos > 0 ? (guidesAsignados / guidesActivos) * 100 : 0),
    penalizacionRate:     round1(guidesActivos > 0 ? (guidesPenalizados / guidesActivos) * 100 : 0),
    pendingCheckIns,
    overdueRecaladas,
    unresolvedTurnos:     turnosAvailable,
    pendientesEval:       evalStats.pendientesEval,
  };

  // ── Check-in flow ──────────────────────────────────────────────────────────
  const checkInFlow = {
    solicitados: checkInsRequested,
    pendientes: pendingCheckIns,
    confirmados: checkInsConfirmed,
    rechazados: checkInsRejected,
    avgResponseTimeMin,
    pendientesAntiguos: oldPendingCheckIns,
  };

  // ── Guide capacity ─────────────────────────────────────────────────────────
  const guideCapacity = {
    activos: guidesActivos,
    disponibles: guidesDisponibles,
    asignados: guidesAsignados,
    libres: guidesLibres,
    noDisponibles: guidesNoDisponibles,
    penalizados: guidesPenalizados,
    disponibilidadRate: kpis.guideAvailabilityRate,
    utilizacionRate:    kpis.utilizacionRate,
    penalizacionRate:   kpis.penalizacionRate,
  };

  // ── Priority actions ───────────────────────────────────────────────────────
  const priorityActions: SupervisorAnalytics["priorityActions"] = [];
  if (overdueRecaladas > 0)
    priorityActions.push({ type: "OVERDUE_RECALADAS", count: overdueRecaladas,
      label: `${overdueRecaladas} recalada${overdueRecaladas !== 1 ? "s" : ""} vencida${overdueRecaladas !== 1 ? "s" : ""}`,
      to: "/recaladas?overdueDeparture=true" });
  if (oldPendingCheckIns > 0)
    priorityActions.push({ type: "OLD_PENDING_CHECKINS", count: oldPendingCheckIns,
      label: `${oldPendingCheckIns} check-in${oldPendingCheckIns !== 1 ? "s" : ""} sin respuesta +15 min`,
      to: "/turnos?checkInPending=1" });
  if (pendingCheckIns > 0)
    priorityActions.push({ type: "PENDING_CHECKINS", count: pendingCheckIns,
      label: `${pendingCheckIns} check-in${pendingCheckIns !== 1 ? "s" : ""} pendiente${pendingCheckIns !== 1 ? "s" : ""}`,
      to: "/turnos?checkInPending=1" });
  if (turnosAvailable > 0)
    priorityActions.push({ type: "UNASSIGNED_TURNOS", count: turnosAvailable,
      label: `${turnosAvailable} turno${turnosAvailable !== 1 ? "s" : ""} sin asignar`,
      to: "/turnos?status=AVAILABLE" });
  if (evalStats.pendientesEval > 0)
    priorityActions.push({ type: "PENDING_EVALS", count: evalStats.pendientesEval,
      label: `${evalStats.pendientesEval} atención${evalStats.pendientesEval !== 1 ? "es" : ""} sin evaluar`,
      to: "/atenciones?pendingEval=true" });

  return {
    range: {
      startDate: startDateStr,
      endDate: endDateStr,
      days: rangeDays,
      tz: tzHintFromOffset(tzOffsetMinutes),
    },
    kpis,
    workloadTrend,
    turnoStatus: breakdown,
    checkInFlow,
    guideCapacity,
    evaluations: evalStats,
    priorityActions,
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

  const overdueRecaladas = supervisor.counts.overdueRecaladas ?? 0;
  if (overdueRecaladas > 0) {
    widgets.push({
      id: "sup-overdue-recaladas",
      type: "alert",
      tone: "danger",
      icon: "ship-off",
      title: "Recaladas vencidas pendientes de zarpe",
      subtitle:
        overdueRecaladas === 1
          ? "1 recalada arribada cuya salida programada ya venció."
          : `${overdueRecaladas} recaladas arribadas cuya salida programada ya venció.`,
      data: {
        items: [
          {
            code: "OVERDUE_RECALADAS",
            label:
              overdueRecaladas === 1
                ? "1 recalada vencida pendiente de zarpe"
                : `${overdueRecaladas} recaladas vencidas pendientes de zarpe`,
            count: overdueRecaladas,
          },
        ],
      },
      actions: [
        {
          label: "Revisar recaladas",
          action: "navigate",
          to: "/recaladas?overdueDeparture=true",
        },
      ],
    });
  }

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
  assignmentMode: TurnoAssignmentMode;
}): Promise<GuiaOverview> {
  const { usuarioId, now, availableAtencionesLimit, assignmentMode } = args;

  const guia = await dashboardRepository.findGuiaIdByUsuarioId(usuarioId);
  if (!guia) {
    return {
      assignmentMode,
      disponibilidad: {
        guiaId: null,
        disponibleParaTurnos: false,
        disponibilidadUpdatedAt: null,
        pendingPenalty: false,
      },
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

  const canManualClaim =
    assignmentMode === TurnoAssignmentMode.MANUAL_RECLAMO &&
    guia.disponibleParaTurnos &&
    !guia.pendingPenalty

  const atenciones = canManualClaim
    ? await dashboardRepository.listAtencionesDisponibles({
        now,
        take: availableAtencionesLimit,
      })
    : [];

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
    assignmentMode,
    disponibilidad: {
      guiaId,
      disponibleParaTurnos: guia.disponibleParaTurnos,
      disponibilidadUpdatedAt: toISO(guia.disponibilidadUpdatedAt),
      pendingPenalty: guia.pendingPenalty,
    },
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
