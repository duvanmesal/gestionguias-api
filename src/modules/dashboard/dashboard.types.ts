import type { RolType, TurnoStatus } from "@prisma/client";

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

export type SupervisorOverview = {
  counts: {
    recaladas: number;
    atenciones: number;
    turnos: number;

    // extras útiles para widgets
    turnosAssigned?: number;
    turnosAvailable?: number;
    turnosInProgress?: number;
    turnosDone?: number;
    turnosCanceled?: number;
  };

  guides?: {
    activos: number;
    asignados: number;
    libres: number;
  };

  turnosBreakdown?: Record<string, number>;

  upcoming: DashboardMilestone[];
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
