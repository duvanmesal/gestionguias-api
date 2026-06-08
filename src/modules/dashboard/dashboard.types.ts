import type { RolType, TurnoAssignmentMode, TurnoStatus } from "@prisma/client";

export type DashboardWidgetTone = "neutral" | "info" | "success" | "warning" | "danger";
export type DashboardWidgetType = "card" | "list" | "kpi" | "cta" | "alert";

export type DashboardWidgetAction = {
  label: string;
  action: "navigate" | "api";
  to?: string;
  method?: "POST" | "PATCH";
  endpoint?: string;
  body?: unknown;
};

/**
 * Widget “listo para pintar”. La UI solo renderiza por `type`/`tone` y consume `data`.
 * Pensado para sidebar + dashboard (inspiración tipo cards de bodas.net).
 */
export type DashboardWidget = {
  id: string;
  type: DashboardWidgetType;
  title: string;
  subtitle?: string;
  tone?: DashboardWidgetTone;
  icon?: string;
  data?: unknown;
  actions?: DashboardWidgetAction[];
};

export type DashboardOverviewResponse = {
  role: RolType;
  turnoAssignmentMode: TurnoAssignmentMode;
  date: string; // YYYY-MM-DD (en el "día" calculado por tzOffsetMinutes)
  tzOffsetMinutes: number;
  generatedAt: string; // ISO

  // info adicional para UI
  serverTime: string; // ISO (server)
  dateContext: {
    date: string;
    timezoneHint: string; // hint UI (ej: America/Bogota o UTC-05:00)
  };

  // widgets por rol (sidebar/dashboard)
  widgets: DashboardWidget[];

  // bloques raw (compat)
  supervisor?: SupervisorOverview;
  guia?: GuiaOverview;
};

export type SupervisorAlert = {
  code: "OVERDUE_RECALADAS" | "UNASSIGNED_TURNOS" | "CANCELED_TURNOS" | string;
  label: string;
  count: number;
};

// ─── Analytics types ─────────────────────────────────────────────────────────

export type WorkloadTrendDay = {
  date: string;
  atenciones: number;
  turnos: number;
  completed: number;
  noShows: number;
  canceled: number;
  checkInsConfirmed: number;
};

export type CheckInFlowStats = {
  solicitados: number;
  pendientes: number;
  confirmados: number;
  rechazados: number;
  avgResponseTimeMin: number | null;
  pendientesAntiguos: number;
};

export type GuideCapacityStats = {
  activos: number;
  disponibles: number;
  asignados: number;
  libres: number;
  noDisponibles: number;
  penalizados: number;
  disponibilidadRate: number;
  utilizacionRate: number;
  penalizacionRate: number;
};

export type EvaluationStats = {
  atencionesEnRango: number;
  evaluadas: number;
  pendientesEval: number;
  avgCalificacion: number | null;
  distribucion: {
    SATISFACTORIA: number;
    CON_NOVEDADES: number;
    NO_SATISFACTORIA: number;
  };
};

export type PriorityAction = {
  type:
    | "OVERDUE_RECALADAS"
    | "UNASSIGNED_TURNOS"
    | "PENDING_CHECKINS"
    | "OLD_PENDING_CHECKINS"
    | "PENDING_EVALS";
  count: number;
  label: string;
  to: string;
};

export type SupervisorAnalytics = {
  range: {
    startDate: string;
    endDate: string;
    days: number;
    tz: string;
  };
  kpis: {
    assignmentRate: number;
    executionRate: number;
    noShowRate: number;
    guideAvailabilityRate: number;
    utilizacionRate: number;
    penalizacionRate: number;
    pendingCheckIns: number;
    overdueRecaladas: number;
    unresolvedTurnos: number;
    pendientesEval: number;
  };
  workloadTrend: WorkloadTrendDay[];
  turnoStatus: Record<string, number>;
  checkInFlow: CheckInFlowStats;
  guideCapacity: GuideCapacityStats;
  evaluations: EvaluationStats;
  priorityActions: PriorityAction[];
};

// ─── Main supervisor/guia overviews ──────────────────────────────────────────

export type SupervisorOverview = {
  counts: {
    recaladas: number;
    atenciones: number;
    turnos: number;

    turnosAssigned?: number;
    turnosAvailable?: number;
    turnosInProgress?: number;
    turnosDone?: number;
    turnosCanceled?: number;
    turnosNoShow?: number;

    overdueRecaladas?: number;
  };

  guides?: {
    activos: number;
    asignados: number;
    libres: number;
    disponibles?: number;
    noDisponibles?: number;
    penalizados?: number;
  };

  turnosBreakdown?: Record<string, number>;

  alerts?: SupervisorAlert[];

  upcoming: DashboardMilestone[];

  /** Trabajo pendiente de acción inmediata */
  pendingWork?: {
    pendingCheckIns: number;
    overdueRecaladas: number;
    unresolvedTurnos: number;
  };

  /** Tasas operativas del día (0–100, redondeadas a 1 decimal) */
  rates?: {
    assignmentRate: number;
    executionRate: number;
    noShowRate: number;
    guideAvailabilityRate: number;
  };

  /** Serie diaria de los últimos 7 días (backward compat) */
  trend7d?: {
    days: Array<{
      date: string;       // YYYY-MM-DD
      atenciones: number;
      turnos: number;
      completed: number;
      noShows: number;
    }>;
  };

  /** Bloque extendido de analytics (7 o 30 días según rangeDays) */
  analytics?: SupervisorAnalytics;
};

export type DashboardMilestoneKind =
  | "RECALADA_ARRIVAL"
  | "RECALADA_DEPARTURE"
  | "ATENCION_START"
  | "ATENCION_END";

export type DashboardMilestone = {
  kind: DashboardMilestoneKind;
  at: string; // ISO
  title: string;
  ref: {
    recaladaId?: number;
    atencionId?: number;
    turnoId?: number;
  };
};

export type GuiaOverview = {
  assignmentMode: TurnoAssignmentMode;
  disponibilidad: {
    guiaId: string | null;
    disponibleParaTurnos: boolean;
    disponibilidadUpdatedAt: string | null;
    pendingPenalty: boolean;
  };
  nextTurno: TurnoLite | null;
  activeTurno: TurnoLite | null;
  atencionesDisponibles: AtencionDisponibleLite[];
};

export type TurnoLite = {
  id: number;
  numero: number;
  status: TurnoStatus;
  checkInAt: string | null;
  checkOutAt: string | null;

  atencion: {
    id: number;
    fechaInicio: string;
    fechaFin: string;

    recalada: {
      id: number;
      codigoRecalada: string;
      fechaLlegada: string;
      fechaSalida: string | null;
      operationalStatus: string;
      buque: {
        nombre: string;
      };
    };
  };
};

export type AtencionDisponibleLite = {
  id: number;
  fechaInicio: string;
  fechaFin: string;
  operationalStatus: string;

  recalada: {
    id: number;
    codigoRecalada: string;
    fechaLlegada: string;
    fechaSalida: string | null;
    operationalStatus: string;
    buque: {
      nombre: string;
    };
  };

  availableTurnos: number;
};
