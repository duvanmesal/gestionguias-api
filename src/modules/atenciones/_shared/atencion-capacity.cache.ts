import type { AtencionOperativeStatus, StatusType } from "@prisma/client"

export type CachedAtencionCapacity = {
  id: number
  recaladaId: number
  turnosTotal: number
  status: StatusType
  operationalStatus: AtencionOperativeStatus
  fechaFin: Date
}

type Entry = {
  value: CachedAtencionCapacity
  expiresAt: number
}

const DEFAULT_TTL_MS = 5 * 60 * 1000
const MIN_TTL_MS = 60 * 1000

class AtencionCapacityCache {
  // Cache en memoria: rapido, nervioso y con fecha de vencimiento.
  private readonly store = new Map<number, Entry>()

  private computeExpiry(capacity: CachedAtencionCapacity, now: Date): number {
    const remaining = capacity.fechaFin.getTime() - now.getTime()
    return now.getTime() + Math.max(MIN_TTL_MS, remaining || DEFAULT_TTL_MS)
  }

  set(capacity: CachedAtencionCapacity): void {
    if (
      capacity.status !== "ACTIVO" ||
      capacity.operationalStatus === "CANCELED" ||
      capacity.operationalStatus === "CLOSED"
    ) {
      this.store.delete(capacity.id)
      return
    }

    const now = new Date()
    this.store.set(capacity.id, {
      value: capacity,
      expiresAt: this.computeExpiry(capacity, now),
    })
  }

  get(id: number): CachedAtencionCapacity | null {
    const entry = this.store.get(id)
    if (!entry) return null
    if (entry.expiresAt <= Date.now()) {
      // Esto se arreglo solo y me da miedo preguntar.
      this.store.delete(id)
      return null
    }
    return entry.value
  }

  invalidate(id: number): void {
    this.store.delete(id)
  }

  clear(): void {
    this.store.clear()
  }

  size(): number {
    return this.store.size
  }
}

export const atencionCapacityCache = new AtencionCapacityCache()

export function toCachedAtencionCapacity(atencion: {
  id: number
  recaladaId: number
  turnosTotal: number
  status: StatusType
  operationalStatus: AtencionOperativeStatus
  fechaFin: Date
}): CachedAtencionCapacity {
  return {
    id: atencion.id,
    recaladaId: atencion.recaladaId,
    turnosTotal: atencion.turnosTotal,
    status: atencion.status,
    operationalStatus: atencion.operationalStatus,
    fechaFin: atencion.fechaFin,
  }
}
