import {
  AtencionOperativeStatus,
  RecaladaOperativeStatus,
  StatusType,
  TurnoAssignmentMode,
  TurnoStatus,
} from "@prisma/client"

import { emitTurnoRealtime } from "../../../core/socket/domain-events"
import { logger } from "../../../libs/logger"
import { prisma } from "../../../prisma/client"
import { operationalConfigService } from "../../operational-config/operational-config.service"

type AutoAssignResult = {
  assigned: number
}

type EligibleGuide = {
  id: string
  usuarioId: string
}

async function isFifoModeActive() {
  const mode = await operationalConfigService.getTurnoAssignmentMode()
  return mode === TurnoAssignmentMode.FIFO_GLOBAL
}

function overlapWhere(args: { fechaInicio: Date | null; fechaFin: Date | null }) {
  if (!args.fechaInicio || !args.fechaFin) return {}

  return {
    fechaInicio: { lt: args.fechaFin },
    fechaFin: { gt: args.fechaInicio },
  }
}

async function findNextEligibleGlobalGuide(args: {
  atencionId: number
  fechaInicio: Date | null
  fechaFin: Date | null
}): Promise<EligibleGuide | null> {
  return prisma.guia.findFirst({
    where: {
      disponibleParaTurnos: true,
      disponibilidadUpdatedAt: { not: null },
      pendingPenalty: false,
      usuario: { activo: true },
      turnos: {
        none: {
          OR: [
            { atencionId: args.atencionId },
            {
              status: { in: [TurnoStatus.ASSIGNED, TurnoStatus.IN_PROGRESS] },
              ...overlapWhere({
                fechaInicio: args.fechaInicio,
                fechaFin: args.fechaFin,
              }),
            },
          ],
        },
      },
    },
    orderBy: [{ disponibilidadUpdatedAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      usuarioId: true,
    },
  })
}

async function fetchTurnoForRealtime(turnoId: number) {
  return prisma.turno.findUnique({
    where: { id: turnoId },
    include: {
      atencion: { select: { recaladaId: true } },
      guia: { select: { usuario: { select: { id: true } } } },
    },
  })
}

export async function autoAssignTurnosForRecaladaUsecase(
  recaladaId: number,
): Promise<AutoAssignResult> {
  if (!(await isFifoModeActive())) return { assigned: 0 }

  const atenciones = await prisma.atencion.findMany({
    where: {
      recaladaId,
      status: StatusType.ACTIVO,
      operationalStatus: AtencionOperativeStatus.OPEN,
      recalada: {
        status: StatusType.ACTIVO,
        operationalStatus: RecaladaOperativeStatus.ARRIVED,
      },
      turnos: { some: { status: TurnoStatus.AVAILABLE, guiaId: null } },
    },
    orderBy: [{ fechaInicio: "asc" }, { id: "asc" }],
    select: { id: true },
  })

  let assigned = 0
  for (const atencion of atenciones) {
    const result = await assignForAtencion(atencion.id)
    assigned += result.assigned
  }

  return { assigned }
}

export async function autoAssignOpenTurnosGlobalUsecase(): Promise<AutoAssignResult> {
  if (!(await isFifoModeActive())) return { assigned: 0 }

  const now = new Date()
  const atenciones = await prisma.atencion.findMany({
    where: {
      status: StatusType.ACTIVO,
      operationalStatus: AtencionOperativeStatus.OPEN,
      fechaFin: { gt: now },
      recalada: {
        status: StatusType.ACTIVO,
        operationalStatus: RecaladaOperativeStatus.ARRIVED,
      },
      turnos: { some: { status: TurnoStatus.AVAILABLE, guiaId: null } },
    },
    orderBy: [{ fechaInicio: "asc" }, { id: "asc" }],
    select: { id: true },
  })

  let assigned = 0
  for (const atencion of atenciones) {
    const result = await assignForAtencion(atencion.id)
    assigned += result.assigned
  }

  return { assigned }
}

export async function assignForAtencion(atencionId: number): Promise<AutoAssignResult> {
  if (!(await isFifoModeActive())) return { assigned: 0 }

  const atencion = await prisma.atencion.findFirst({
    where: {
      id: atencionId,
      status: StatusType.ACTIVO,
      operationalStatus: AtencionOperativeStatus.OPEN,
      recalada: {
        status: StatusType.ACTIVO,
        operationalStatus: RecaladaOperativeStatus.ARRIVED,
      },
    },
    select: { id: true },
  })

  if (!atencion) return { assigned: 0 }

  const turnosDisponibles = await prisma.turno.findMany({
    where: { atencionId, status: TurnoStatus.AVAILABLE, guiaId: null },
    orderBy: { numero: "asc" },
    select: { id: true, numero: true, fechaInicio: true, fechaFin: true },
  })

  let assigned = 0

  for (const turno of turnosDisponibles) {
    const next = await findNextEligibleGlobalGuide({
      atencionId,
      fechaInicio: turno.fechaInicio,
      fechaFin: turno.fechaFin,
    })

    if (!next) break

    const updated = await prisma.turno.updateMany({
      where: { id: turno.id, status: TurnoStatus.AVAILABLE, guiaId: null },
      data: { guiaId: next.id, status: TurnoStatus.ASSIGNED },
    })

    if (updated.count !== 1) continue

    assigned += 1

    const turnoActualizado = await fetchTurnoForRealtime(turno.id)
    if (turnoActualizado) {
      emitTurnoRealtime("turno:assigned", turnoActualizado, { guiaUserId: next.usuarioId })
    }
  }

  if (assigned > 0) {
    logger.info({ atencionId, count: assigned }, "[Disponibilidad] turnos auto-asignados por FIFO global")
  }

  return { assigned }
}

export async function autoAssignNextInQueue(
  atencionId: number,
  turnoId: number,
): Promise<unknown | null> {
  if (!(await isFifoModeActive())) return null

  const turno = await prisma.turno.findUnique({
    where: { id: turnoId },
    select: {
      id: true,
      atencionId: true,
      fechaInicio: true,
      fechaFin: true,
      status: true,
      atencion: {
        select: {
          status: true,
          operationalStatus: true,
          recalada: {
            select: {
              status: true,
              operationalStatus: true,
            },
          },
        },
      },
    },
  })

  if (!turno || turno.atencionId !== atencionId || turno.status !== TurnoStatus.NO_SHOW) {
    return null
  }

  if (
    turno.atencion.status !== StatusType.ACTIVO ||
    turno.atencion.operationalStatus !== AtencionOperativeStatus.OPEN ||
    turno.atencion.recalada.status !== StatusType.ACTIVO ||
    turno.atencion.recalada.operationalStatus !== RecaladaOperativeStatus.ARRIVED
  ) {
    return null
  }

  const next = await findNextEligibleGlobalGuide({
    atencionId,
    fechaInicio: turno.fechaInicio,
    fechaFin: turno.fechaFin,
  })

  if (!next) {
    logger.info({ atencionId, turnoId }, "[Disponibilidad] no hay guía FIFO elegible para reemplazar")
    return null
  }

  const updated = await prisma.turno.updateMany({
    where: { id: turnoId, status: TurnoStatus.NO_SHOW },
    data: { guiaId: next.id, status: TurnoStatus.ASSIGNED },
  })

  if (updated.count !== 1) return null

  const turnoActualizado = await fetchTurnoForRealtime(turnoId)
  if (turnoActualizado) {
    emitTurnoRealtime("turno:assigned", turnoActualizado, { guiaUserId: next.usuarioId })
  }

  logger.info(
    { atencionId, turnoId, guiaId: next.id },
    "[Disponibilidad] turno reasignado por FIFO global tras NO_SHOW",
  )

  return turnoActualizado
}
