import type { RolType, TurnoStatus } from "@prisma/client";

export type DashboardOverviewResponse = {
  role: RolType;
  date: string; // YYYY-MM-DD (en el "día" calculado por tzOffsetMinutes)
  tzOffsetMinutes: number;
  generatedAt: string; // ISO
  supervisor?: SupervisorOverview;
  guia?: GuiaOverview;
};

export type SupervisorOverview = {
  counts: {
    recaladas: number;
    atenciones: number;
    turnos: number;
  };
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
