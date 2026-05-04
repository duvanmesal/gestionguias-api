import type {
  AtencionOperativeStatus,
  RecaladaOperativeStatus,
  StatusType,
} from "@prisma/client"

import { ConflictError } from "../../../libs/errors"

export type OperativeGate = {
  atencion: { status: StatusType; operationalStatus: AtencionOperativeStatus }
  recalada: { status: StatusType; operationalStatus: RecaladaOperativeStatus }
}

export function assertOperacionPermitida(gate: OperativeGate) {
  if (gate.recalada.status !== "ACTIVO") throw new ConflictError("La recalada no está activa")
  if (gate.atencion.status !== "ACTIVO") throw new ConflictError("La atención no está activa")

  if (gate.recalada.operationalStatus === "CANCELED")
    throw new ConflictError("La recalada está cancelada")
  if (gate.recalada.operationalStatus === "DEPARTED")
    throw new ConflictError("La recalada ya finalizó (DEPARTED)")

  if (gate.atencion.operationalStatus === "CANCELED")
    throw new ConflictError("La atención está cancelada")
  if (gate.atencion.operationalStatus === "CLOSED")
    throw new ConflictError("La atención está cerrada")
}

/**
 * Si en el futuro quieres obligar FIFO para check-in, cambia esto a true.
 * Se dejó exactamente como el service original.
 */
export const ENFORCE_FIFO_CHECKIN = false

/** Ventana máxima de anticipación para check-in (30 min antes del inicio) */
export const CHECKIN_EARLY_WINDOW_MS = 30 * 60 * 1000

/** Grace period antes de marcar NO_SHOW automático (30 min después del inicio) */
export const NO_SHOW_GRACE_MS = 30 * 60 * 1000

/** Margen antes de cierre automático (30 min después del fin programado) */
export const AUTO_COMPLETE_MARGIN_MS = 30 * 60 * 1000

export function buildNoShowObservacion(reason?: string): string {
  const base = "NO_SHOW"
  if (!reason?.trim()) return base
  return `${base}: ${reason.trim()}`
}