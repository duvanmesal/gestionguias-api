import type {
  Prisma,
  RecaladaSource,
  RecaladaOperativeStatus,
  RolType,
} from "@prisma/client"

import { BadRequestError } from "../../../libs/errors"

/**
 * Genera código final estilo RA-YYYY-000123 usando el ID autoincremental.
 * Ej: RA-2026-000015
 */
export function buildCodigoRecalada(fechaLlegada: Date, id: number) {
  const year = fechaLlegada.getUTCFullYear()
  const seq = String(id).padStart(6, "0")
  return `RA-${year}-${seq}`
}

/**
 * Código temporal ÚNICO para cumplir @unique al insertar antes de tener ID.
 */
export function tempCodigoRecalada() {
  return `TEMP-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function toISO(d?: Date) {
  return d ? d.toISOString() : undefined
}

export function pickAllowedFields<T extends Record<string, any>>(input: T, allowed: string[]) {
  const out: Record<string, any> = {}
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      out[key] = input[key]
    }
  }
  return out
}

export function normalizeNullableFields(data: Record<string, any>): Record<string, any> {
  // Hook para normalizar campos a null si algún día aceptas null explícitos.
  return data
}

export function assertFechaSalidaGteFechaLlegada(fechaLlegada: Date, fechaSalida: Date) {
  if (fechaSalida < fechaLlegada) {
    throw new BadRequestError("fechaSalida debe ser >= fechaLlegada")
  }
}

export function assertManualFechaSalidaNotPast(
  source: RecaladaSource,
  fechaSalida: Date,
  now: Date,
) {
  if (source !== "IMPORT" && fechaSalida < now) {
    throw new BadRequestError(
      "fechaSalida debe ser >= ahora para recalada MANUAL (operativa)",
    )
  }
}

export function assertPasajerosEstimadosMin1(pasajerosEstimados: number) {
  if (pasajerosEstimados < 1) {
    throw new BadRequestError("pasajerosEstimados debe ser >= 1")
  }
}

export function assertCanUpdate(operationalStatus: RecaladaOperativeStatus) {
  if (operationalStatus === "DEPARTED" || operationalStatus === "CANCELED") {
    throw new BadRequestError(
      "No se puede editar una recalada en estado DEPARTED o CANCELED",
    )
  }
}

export function getUpdateAllowedFields(operationalStatus: RecaladaOperativeStatus) {
  const allowedWhenScheduled = [
    "buqueId",
    "paisOrigenId",
    "fechaLlegada",
    "fechaSalida",
    "terminal",
    "muelle",
    "pasajerosEstimados",
    "tripulacionEstimada",
    "observaciones",
    "fuente",
  ]

  const allowedWhenArrived = [
    "fechaSalida",
    "terminal",
    "muelle",
    "pasajerosEstimados",
    "tripulacionEstimada",
    "observaciones",
  ]

  return operationalStatus === "SCHEDULED" ? allowedWhenScheduled : allowedWhenArrived
}

export function buildUpdateData(args: {
  current: {
    operationalStatus: RecaladaOperativeStatus
    fechaLlegada: Date
    fechaSalida: Date | null
  }
  input: Record<string, any>
}): { data: Prisma.RecaladaUpdateInput; updatedKeys: string[] } {
  assertCanUpdate(args.current.operationalStatus)

  const allowed = getUpdateAllowedFields(args.current.operationalStatus)

  const dataRaw = pickAllowedFields(args.input, allowed)
  const dataNormalized = normalizeNullableFields(dataRaw)

  if (Object.keys(dataNormalized).length === 0) {
    throw new BadRequestError(
      "No hay campos permitidos para actualizar según el estado actual",
    )
  }

  const nextFechaLlegada: Date =
    (dataNormalized.fechaLlegada as Date | undefined) ?? args.current.fechaLlegada

  const nextFechaSalida: Date | null =
    typeof dataNormalized.fechaSalida !== "undefined"
      ? (dataNormalized.fechaSalida as Date | null)
      : args.current.fechaSalida

  if (nextFechaSalida) {
    assertFechaSalidaGteFechaLlegada(nextFechaLlegada, nextFechaSalida)
  }

  if (typeof dataNormalized.fechaSalida !== "undefined") {
    dataNormalized.fechaSalida = (dataNormalized.fechaSalida as Date | null) ?? null
  }

  return {
    data: dataNormalized as Prisma.RecaladaUpdateInput,
    updatedKeys: Object.keys(dataNormalized),
  }
}

export function assertCanArrive(operationalStatus: RecaladaOperativeStatus) {
  if (operationalStatus === "DEPARTED") {
    throw new BadRequestError(
      "No se puede marcar ARRIVED una recalada en estado DEPARTED",
    )
  }
  if (operationalStatus === "CANCELED") {
    throw new BadRequestError(
      "No se puede marcar ARRIVED una recalada en estado CANCELED",
    )
  }
  if (operationalStatus !== "SCHEDULED") {
    throw new BadRequestError(
      "Solo se puede marcar ARRIVED si la recalada está en SCHEDULED",
    )
  }
}

export function assertCanDepart(operationalStatus: RecaladaOperativeStatus) {
  if (operationalStatus === "CANCELED") {
    throw new BadRequestError(
      "No se puede marcar DEPARTED una recalada en estado CANCELED",
    )
  }
  if (operationalStatus === "DEPARTED") {
    throw new BadRequestError("La recalada ya está en DEPARTED")
  }
  if (operationalStatus !== "ARRIVED") {
    throw new BadRequestError(
      "Solo se puede marcar DEPARTED si la recalada está en ARRIVED",
    )
  }
}

export function assertDepartedAtGteArrivedAt(arrivedAt: Date | null, departedAt: Date) {
  if (arrivedAt && departedAt < arrivedAt) {
    throw new BadRequestError("departedAt debe ser >= arrivedAt")
  }
}

export function assertCanCancel(operationalStatus: RecaladaOperativeStatus, actorRol?: RolType) {
  if (operationalStatus === "DEPARTED") {
    throw new BadRequestError(
      "No se puede cancelar una recalada en estado DEPARTED",
    )
  }
  if (operationalStatus === "CANCELED") {
    throw new BadRequestError("La recalada ya está en estado CANCELED")
  }

  // Regla: si ya ARRIVED, solo SUPER_ADMIN puede cancelar
  if (operationalStatus === "ARRIVED") {
    if (!actorRol) {
      throw new BadRequestError("No se pudo determinar el rol del usuario")
    }
    if (actorRol !== "SUPER_ADMIN") {
      throw new BadRequestError(
        "Solo SUPER_ADMIN puede cancelar una recalada que ya ARRIVED",
      )
    }
  }
}

export function assertNoDependenciesForCancel(atencionesCount: number, turnosCount: number) {
  if (atencionesCount > 0 || turnosCount > 0) {
    throw new BadRequestError(
      "No se puede cancelar la recalada porque tiene atenciones/turnos asociados. Defina política de cascada (cancelar o bloquear) para habilitar esta acción.",
    )
  }
}

export function assertCanDeleteSafe(operationalStatus: RecaladaOperativeStatus) {
  if (operationalStatus !== "SCHEDULED") {
    throw new BadRequestError(
      "No se puede eliminar físicamente una recalada que no esté en SCHEDULED. Use cancelación.",
    )
  }
}

export function assertNoAtencionesForDelete(atencionesCount: number) {
  if (atencionesCount > 0) {
    throw new BadRequestError(
      "No se puede eliminar la recalada porque tiene atenciones asociadas. Use cancelación.",
    )
  }
}

export function assertNoTurnosForDelete(turnosCount: number) {
  if (turnosCount > 0) {
    throw new BadRequestError(
      "No se puede eliminar la recalada porque tiene turnos asociados. Use cancelación.",
    )
  }
}