import type { Prisma } from "@prisma/client"

import { prisma } from "../../../prisma/client"
import { ConflictError } from "../../../libs/errors"

import { turnoSelect } from "./turno.select"
import type { TurnoDetail } from "./turno.select"

export type Tx = Prisma.TransactionClient

const pendingCheckInWhere: Prisma.TurnoWhereInput = {
  checkInRequestedAt: { not: null },
  checkInConfirmedAt: null,
  checkInRejectedAt: null,
}

function db(tx?: Tx) {
  return tx ?? prisma
}

export class TurnoRepository {
  // -------------------------
  // Transactions
  // -------------------------
  transaction<T>(fn: (tx: Tx) => Promise<T>) {
    return prisma.$transaction(fn)
  }

  // -------------------------
  // Actors
  // -------------------------
  async getActorGuiaIdOrThrow(actorUserId: string, tx?: Tx): Promise<string> {
    const guia = await db(tx).guia.findUnique({
      where: { usuarioId: actorUserId },
      select: { id: true, usuario: { select: { activo: true } } },
    })

    if (!guia) throw new ConflictError("El usuario autenticado no está asociado a un guía")
    if (!guia.usuario.activo) throw new ConflictError("Tu cuenta de guía está inactiva")

    return guia.id
  }

  findGuiaByUserId(actorUserId: string, tx?: Tx) {
    return db(tx).guia.findUnique({
      where: { usuarioId: actorUserId },
      select: {
        id: true,
        pendingPenalty: true,
        disponibleParaTurnos: true,
        disponibilidadUpdatedAt: true,
        usuario: { select: { id: true, activo: true } },
      },
    })
  }

  findGuiaById(guiaId: string, tx?: Tx) {
    return db(tx).guia.findUnique({
      where: { id: guiaId },
      select: {
        id: true,
        pendingPenalty: true,
        disponibleParaTurnos: true,
        disponibilidadUpdatedAt: true,
        usuario: { select: { id: true, activo: true } },
      },
    })
  }

  // -------------------------
  // Lists
  // -------------------------
  listWithCount(args: {
    where: Prisma.TurnoWhereInput
    skip: number
    take: number
  }): Promise<[number, TurnoDetail[]]> {
    return prisma.$transaction([
      prisma.turno.count({ where: args.where }),
      prisma.turno.findMany({
        where: args.where,
        select: turnoSelect,
        orderBy: [{ fechaInicio: "asc" }, { atencionId: "asc" }, { numero: "asc" }],
        skip: args.skip,
        take: args.take,
      }),
    ])
  }

  // -------------------------
  // Reads
  // -------------------------
  findById(turnoId: number, tx?: Tx) {
    return db(tx).turno.findUnique({ where: { id: turnoId }, select: turnoSelect })
  }

  /**
   * Turno + gate (atención/recalada) para operaciones que deben respetar estado operativo.
   */
  findGateForOperacion(turnoId: number, tx?: Tx) {
    return db(tx).turno.findUnique({
      where: { id: turnoId },
      select: {
        id: true,
        atencionId: true,
        guiaId: true,
        numero: true,
        status: true,
        fechaInicio: true,
        fechaFin: true,
        checkInAt: true,
        checkOutAt: true,
        checkInRequestedAt: true,
        checkInConfirmedAt: true,
        checkInRejectedAt: true,
        checkInRejectReason: true,
        observaciones: true,
        guia: {
          select: {
            usuario: {
              select: { id: true },
            },
          },
        },
        atencion: {
          select: {
            recaladaId: true,
            status: true,
            operationalStatus: true,
            recalada: {
              select: {
                status: true,
                operationalStatus: true,
                id: true,
                codigoRecalada: true,
              },
            },
          },
        },
      },
    })
  }

  findNextForGuia(guiaId: string, tx?: Tx) {
    return db(tx).turno.findFirst({
      where: {
        guiaId,
        status: { in: ["ASSIGNED", "IN_PROGRESS"] },
        fechaInicio: { not: null },
        fechaFin: { not: null },
      },
      select: turnoSelect,
      orderBy: [{ fechaInicio: "asc" }, { atencionId: "asc" }, { numero: "asc" }],
    })
  }

  findActiveForGuia(guiaId: string, tx?: Tx) {
    return db(tx).turno.findFirst({
      where: { guiaId, status: "IN_PROGRESS" },
      select: turnoSelect,
      orderBy: [{ fechaInicio: "asc" }, { atencionId: "asc" }, { numero: "asc" }],
    })
  }

  findExistingTurnoForGuia(args: { atencionId: number; guiaId: string }, tx?: Tx) {
    return db(tx).turno.findFirst({
      where: { atencionId: args.atencionId, guiaId: args.guiaId },
      select: { id: true },
    })
  }

  findFirstAvailableTurnoForAtencion(atencionId: number, tx?: Tx) {
    return db(tx).turno.findFirst({
      where: { atencionId, status: "AVAILABLE", guiaId: null },
      orderBy: { numero: "asc" },
      select: { id: true, numero: true },
    })
  }

  findOverlappingTurnoForGuia(
    args: { guiaId: string; fechaInicio: Date; fechaFin: Date; excludeTurnoId?: number },
    tx?: Tx,
  ) {
    return db(tx).turno.findFirst({
      where: {
        guiaId: args.guiaId,
        status: { in: ["ASSIGNED", "IN_PROGRESS"] },
        ...(args.excludeTurnoId ? { id: { not: args.excludeTurnoId } } : {}),
        fechaInicio: { lt: args.fechaFin },
        fechaFin: { gt: args.fechaInicio },
      },
      select: { id: true, numero: true, fechaInicio: true, fechaFin: true, atencionId: true },
    })
  }

  findForUnassign(turnoId: number, tx?: Tx) {
    return db(tx).turno.findUnique({
      where: { id: turnoId },
      select: { id: true, atencionId: true, guiaId: true, status: true },
    })
  }

  unassign(turnoId: number, tx?: Tx) {
    return db(tx).turno.update({
      where: { id: turnoId },
      data: { guiaId: null, status: "AVAILABLE" },
      select: turnoSelect,
    })
  }

  findForCancel(turnoId: number, tx?: Tx) {
    return db(tx).turno.findUnique({
      where: { id: turnoId },
      select: { id: true, atencionId: true, guiaId: true, status: true, canceledAt: true },
    })
  }

  cancel(args: { turnoId: number; now: Date; cancelReason?: string; actorUserId: string }, tx?: Tx) {
    return db(tx).turno.update({
      where: { id: args.turnoId },
      data: {
        status: "CANCELED",
        canceledAt: args.now,
        cancelReason: args.cancelReason?.trim() ? args.cancelReason.trim() : null,
        canceledById: args.actorUserId,
      },
      select: turnoSelect,
    })
  }

  findPrevPendingAssignedTurno(args: { atencionId: number; numero: number }, tx?: Tx) {
    return db(tx).turno.findFirst({
      where: { atencionId: args.atencionId, status: "ASSIGNED", numero: { lt: args.numero } },
      select: { id: true, numero: true },
      orderBy: { numero: "asc" },
    })
  }

  // -------------------------
  // Atomic mutations
  // -------------------------
  claimIfStillAvailable(args: { turnoId: number; guiaId: string }, tx: Tx) {
    return tx.turno.updateMany({
      where: { id: args.turnoId, status: "AVAILABLE", guiaId: null },
      data: { guiaId: args.guiaId, status: "ASSIGNED" },
    })
  }

  assignIfStillAvailable(args: { turnoId: number; guiaId: string }, tx: Tx) {
    return tx.turno.updateMany({
      where: { id: args.turnoId, status: "AVAILABLE", guiaId: null },
      data: { guiaId: args.guiaId, status: "ASSIGNED" },
    })
  }

  /**
   * Doble check-in: el guía registra la solicitud (no inicia oficialmente).
   * Solo aplica si el turno aún está ASSIGNED, sin solicitud previa pendiente.
   */
  requestCheckInIfStillAssigned(
    args: { turnoId: number; guiaId: string; now: Date },
    tx: Tx,
  ) {
    return tx.turno.updateMany({
      where: {
        id: args.turnoId,
        status: "ASSIGNED",
        guiaId: args.guiaId,
        checkInRequestedAt: null,
        checkInConfirmedAt: null,
      },
      data: {
        checkInRequestedAt: args.now,
        checkInRejectedAt: null,
        checkInRejectedById: null,
        checkInRejectReason: null,
      },
    })
  }

  /**
   * Doble check-in: el supervisor confirma una solicitud pendiente.
   * Solo aplica si hay solicitud y aún no fue confirmada/rechazada.
   * Al confirmar se materializa el `checkInAt` con el momento de la solicitud
   * y el turno pasa a IN_PROGRESS.
   */
  confirmCheckInIfStillPending(
    args: { turnoId: number; supervisorUserId: string; now: Date },
    tx: Tx,
  ) {
    return tx.turno.updateMany({
      where: {
        id: args.turnoId,
        status: "ASSIGNED",
        checkInRequestedAt: { not: null },
        checkInConfirmedAt: null,
        checkInRejectedAt: null,
      },
      data: {
        status: "IN_PROGRESS",
        checkInConfirmedAt: args.now,
        checkInConfirmedById: args.supervisorUserId,
        checkInAt: args.now,
      },
    })
  }

  /**
   * Doble check-in: el supervisor rechaza una solicitud pendiente.
   * El turno queda en ASSIGNED, listo para revisión, NO_SHOW o reasignación.
   */
  rejectCheckInIfStillPending(
    args: {
      turnoId: number
      supervisorUserId: string
      now: Date
      reason: string
    },
    tx: Tx,
  ) {
    return tx.turno.updateMany({
      where: {
        id: args.turnoId,
        status: "ASSIGNED",
        checkInRequestedAt: { not: null },
        checkInConfirmedAt: null,
        checkInRejectedAt: null,
      },
      data: {
        checkInRejectedAt: args.now,
        checkInRejectedById: args.supervisorUserId,
        checkInRejectReason: args.reason,
      },
    })
  }

  listPendingCheckIns(args: {
    atencionId?: number
    recaladaId?: number
    skip: number
    take: number
  }): Promise<[number, TurnoDetail[]]> {
    const where: Prisma.TurnoWhereInput = {
      status: "ASSIGNED",
      checkInRequestedAt: { not: null },
      checkInConfirmedAt: null,
      checkInRejectedAt: null,
      ...(args.atencionId ? { atencionId: args.atencionId } : {}),
      ...(args.recaladaId
        ? { atencion: { recaladaId: args.recaladaId } }
        : {}),
    }

    return prisma.$transaction([
      prisma.turno.count({ where }),
      prisma.turno.findMany({
        where,
        select: turnoSelect,
        orderBy: [{ checkInRequestedAt: "asc" }, { atencionId: "asc" }, { numero: "asc" }],
        skip: args.skip,
        take: args.take,
      }),
    ])
  }

  checkOutIfStillInProgress(args: { turnoId: number; guiaId: string; now: Date }, tx: Tx) {
    return tx.turno.updateMany({
      where: { id: args.turnoId, status: "IN_PROGRESS", guiaId: args.guiaId },
      data: { checkOutAt: args.now, status: "COMPLETED" },
    })
  }

  noShowIfStillAssigned(args: { turnoId: number; mergedObs: string }, tx: Tx) {
    return tx.turno.updateMany({
      where: { id: args.turnoId, status: "ASSIGNED", NOT: pendingCheckInWhere },
      data: { status: "NO_SHOW", observaciones: args.mergedObs },
    })
  }

  // -------------------------
  // Automation job helpers
  // -------------------------
  findExpiredAssigned(gracePeriodMs: number) {
    const cutoff = new Date(Date.now() - gracePeriodMs)
    return prisma.turno.findMany({
      where: {
        status: "ASSIGNED",
        fechaInicio: { lte: cutoff },
        NOT: pendingCheckInWhere,
      },
      select: {
        id: true,
        atencionId: true,
        guiaId: true,
        atencion: { select: { recaladaId: true } },
        guia: { select: { usuario: { select: { id: true } } } },
      },
    })
  }

  findExpiredInProgress(marginMs: number) {
    const cutoff = new Date(Date.now() - marginMs)
    return prisma.turno.findMany({
      where: { status: "IN_PROGRESS", fechaFin: { lte: cutoff } },
      select: {
        id: true,
        atencionId: true,
        guiaId: true,
        atencion: { select: { recaladaId: true } },
        guia: { select: { usuario: { select: { id: true } } } },
      },
    })
  }

  bulkNoShow(turnoIds: number[], now: Date) {
    return prisma.turno.updateMany({
      where: { id: { in: turnoIds }, status: "ASSIGNED", NOT: pendingCheckInWhere },
      data: { status: "NO_SHOW", observaciones: "NO_SHOW automático por inasistencia" },
    })
  }

  bulkAutoComplete(turnoIds: number[], now: Date) {
    return prisma.turno.updateMany({
      where: { id: { in: turnoIds }, status: "IN_PROGRESS" },
      data: { status: "COMPLETED", checkOutAt: now, observaciones: "Cierre automático" },
    })
  }
}

export const turnoRepository = new TurnoRepository()
