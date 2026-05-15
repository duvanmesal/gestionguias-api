import type { RecaladaOperativeStatus, StatusType } from "@prisma/client"

import { logger } from "../../../libs/logger"

/**
 * Caché en memoria de recaladas vigentes (status ACTIVO + operationalStatus
 * SCHEDULED o ARRIVED). Es apoyo operativo, NO fuente de verdad: la BD sigue
 * siendo la fuente final. La caché se reconstruye perezosamente y se invalida
 * en cada mutación relevante.
 *
 * TTL por ítem:
 *   - Si la recalada tiene fechaSalida -> TTL = max(60s, fechaSalida - now)
 *   - Si no tiene fechaSalida          -> TTL corto defensivo (DEFAULT_TTL_MS)
 */

export type CachedRecalada = {
  id: number
  codigoRecalada: string
  buqueId: number
  status: StatusType
  operationalStatus: RecaladaOperativeStatus
  fechaLlegada: Date
  fechaSalida: Date | null
  arrivedAt: Date | null
}

type Entry = {
  value: CachedRecalada
  expiresAt: number // epoch ms
}

const DEFAULT_TTL_MS = 5 * 60 * 1000 // 5 minutos
const MIN_TTL_MS = 60 * 1000 // 1 minuto

class RecaladaCache {
  private readonly store = new Map<number, Entry>()

  private computeExpiry(rec: CachedRecalada, now: Date): number {
    if (rec.fechaSalida) {
      const remaining = rec.fechaSalida.getTime() - now.getTime()
      // Si ya está vencida la TTL minima de defensa permite que la alerta de
      // "overdue" la mantenga unos segundos disponible para el filtro.
      return now.getTime() + Math.max(MIN_TTL_MS, remaining)
    }
    return now.getTime() + DEFAULT_TTL_MS
  }

  /**
   * Solo cachea recaladas vigentes (ACTIVO + SCHEDULED/ARRIVED). Cualquier otro
   * estado se trata como invalidación.
   */
  set(rec: CachedRecalada): void {
    if (rec.status !== "ACTIVO" || (rec.operationalStatus !== "SCHEDULED" && rec.operationalStatus !== "ARRIVED")) {
      this.store.delete(rec.id)
      return
    }

    const now = new Date()
    this.store.set(rec.id, {
      value: rec,
      expiresAt: this.computeExpiry(rec, now),
    })
  }

  get(id: number): CachedRecalada | null {
    const entry = this.store.get(id)
    if (!entry) return null
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(id)
      return null
    }
    return entry.value
  }

  invalidate(id: number): void {
    this.store.delete(id)
  }

  /**
   * Lista todas las recaladas vigentes en caché (limpia las expiradas).
   */
  list(): CachedRecalada[] {
    const now = Date.now()
    const out: CachedRecalada[] = []
    for (const [id, entry] of this.store.entries()) {
      if (entry.expiresAt <= now) {
        this.store.delete(id)
        continue
      }
      out.push(entry.value)
    }
    return out
  }

  /**
   * Recaladas en estado ARRIVED cuyo zarpe programado ya venció.
   * Si una recalada no tiene fechaSalida, se excluye (no hay vencimiento).
   */
  listOverdueDepartures(now: Date = new Date()): CachedRecalada[] {
    return this.list().filter(
      (r) =>
        r.operationalStatus === "ARRIVED" &&
        r.fechaSalida !== null &&
        r.fechaSalida.getTime() < now.getTime(),
    )
  }

  size(): number {
    return this.store.size
  }

  clear(): void {
    this.store.clear()
  }
}

export const recaladaCache = new RecaladaCache()

/**
 * Helper para mapear un Recalada (con select recaladaSelect o equivalente) al
 * shape mínimo del caché. Acepta `unknown` para minimizar acoplamiento.
 */
export function toCachedRecalada(rec: {
  id: number
  codigoRecalada: string
  status: StatusType
  operationalStatus: RecaladaOperativeStatus
  fechaLlegada: Date
  fechaSalida: Date | null
  arrivedAt: Date | null
  buque?: { id: number } | null
  buqueId?: number
}): CachedRecalada {
  const buqueId = rec.buqueId ?? rec.buque?.id
  if (typeof buqueId !== "number") {
    logger.warn(
      { recaladaId: rec.id },
      "[RecaladaCache] toCachedRecalada called without buqueId",
    )
  }
  return {
    id: rec.id,
    codigoRecalada: rec.codigoRecalada,
    buqueId: buqueId ?? 0,
    status: rec.status,
    operationalStatus: rec.operationalStatus,
    fechaLlegada: rec.fechaLlegada,
    fechaSalida: rec.fechaSalida,
    arrivedAt: rec.arrivedAt,
  }
}
