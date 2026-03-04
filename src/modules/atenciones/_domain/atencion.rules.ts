import type {
  AtencionOperativeStatus,
  RecaladaOperativeStatus,
  StatusType,
} from "@prisma/client"

import { BadRequestError, ConflictError } from "../../../libs/errors"

export function toISO(d?: Date) {
  return d ? d.toISOString() : undefined
}

export function assertTurnosTotalValid(turnosTotal: number) {
  if (!Number.isInteger(turnosTotal) || turnosTotal < 1) {
    throw new BadRequestError("turnosTotal debe ser un entero >= 1")
  }
}

export function assertWindowDatesValid(fechaInicio: Date, fechaFin: Date) {
  if (fechaFin < fechaInicio) {
    throw new BadRequestError("fechaFin debe ser >= fechaInicio")
  }
}

export function assertWindowNotPast(fechaInicio: Date, fechaFin: Date, now: Date) {
  if (fechaInicio < now) {
    throw new BadRequestError("fechaInicio debe ser >= ahora")
  }
  if (fechaFin < now) {
    throw new BadRequestError("fechaFin debe ser >= ahora")
  }
}

export function assertRecaladaOperable(args: {
  recalada: {
    id: number
    status: StatusType
    operationalStatus: RecaladaOperativeStatus
    fechaSalida: Date | null
  }
  now: Date
  actionLabel: "crear" | "editar" | "cancelar" | "cerrar" | "operar"
}) {
  if (args.recalada.status !== "ACTIVO") {
    throw new ConflictError("La recalada no está activa")
  }

  if (args.recalada.operationalStatus === "CANCELED") {
    throw new ConflictError("La recalada está cancelada")
  }

  if (args.recalada.operationalStatus === "DEPARTED") {
    throw new ConflictError("La recalada ya finalizó (DEPARTED)")
  }

  if (args.recalada.fechaSalida && args.recalada.fechaSalida < args.now) {
    const msg =
      args.actionLabel === "crear"
        ? "No se puede crear una atención: la recalada ya zarpó (fechaSalida < ahora)"
        : "No se puede editar la atención: la recalada ya zarpó (fechaSalida < ahora)"

    throw new ConflictError(msg)
  }
}

export function assertWindowWithinRecalada(args: {
  fechaInicio: Date
  fechaFin: Date
  recalada: { fechaLlegada: Date; fechaSalida: Date | null }
}) {
  if (args.fechaInicio < args.recalada.fechaLlegada) {
    throw new BadRequestError(
      "fechaInicio debe ser >= fechaLlegada de la recalada",
    )
  }

  if (args.fechaFin < args.recalada.fechaLlegada) {
    throw new BadRequestError("fechaFin debe ser >= fechaLlegada de la recalada")
  }

  if (args.recalada.fechaSalida) {
    if (args.fechaInicio > args.recalada.fechaSalida) {
      throw new BadRequestError(
        "fechaInicio debe ser <= fechaSalida de la recalada",
      )
    }

    if (args.fechaFin > args.recalada.fechaSalida) {
      throw new BadRequestError("fechaFin debe ser <= fechaSalida de la recalada")
    }
  }
}

export type OperativeGate = {
  atencion: { status: StatusType; operationalStatus: AtencionOperativeStatus }
  recalada: { status: StatusType; operationalStatus: RecaladaOperativeStatus }
}

export function assertOperacionPermitida(gate: OperativeGate) {
  // Admin status
  if (gate.recalada.status !== "ACTIVO") {
    throw new ConflictError("La recalada no está activa")
  }
  if (gate.atencion.status !== "ACTIVO") {
    throw new ConflictError("La atención no está activa")
  }

  // Recalada operative status
  if (gate.recalada.operationalStatus === "CANCELED") {
    throw new ConflictError("La recalada está cancelada")
  }
  if (gate.recalada.operationalStatus === "DEPARTED") {
    throw new ConflictError("La recalada ya finalizó (DEPARTED)")
  }

  // Atención operative status
  if (gate.atencion.operationalStatus === "CANCELED") {
    throw new ConflictError("La atención está cancelada")
  }
  if (gate.atencion.operationalStatus === "CLOSED") {
    throw new ConflictError("La atención está cerrada")
  }
}

export function assertAtencionEditable(operationalStatus: AtencionOperativeStatus) {
  if (operationalStatus === "CANCELED") {
    throw new ConflictError("No se puede editar una atención cancelada")
  }
}