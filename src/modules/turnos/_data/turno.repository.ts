import type { Prisma } from "@prisma/client"

import { prisma } from "../../../prisma/client"
import { ConflictError } from "../../../libs/errors"

import { turnoSelect } from "./turno.select"
import type { TurnoDetail } from "./turno.select"

export type Tx = Prisma.TransactionClient

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
      select: { id: true },
    })

    if (!guia) throw new ConflictError("El usuario autenticado no está asociado a un guía")

    return guia.id
  }

  findGuiaById(guiaId: string, tx?: Tx) {
    return db(tx).guia.findUnique({ where: { id: guiaId }, select: { id: true } })
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
        checkInAt: true,
        checkOutAt: true,
        observaciones: true,
        atencion: {
          select: {
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

  checkInIfStillAssigned(args: { turnoId: number; guiaId: string; now: Date }, tx: Tx) {
    return tx.turno.updateMany({
      where: { id: args.turnoId, status: "ASSIGNED", guiaId: args.guiaId },
      data: { checkInAt: args.now, status: "IN_PROGRESS" },
    })
  }

  checkOutIfStillInProgress(args: { turnoId: number; guiaId: string; now: Date }, tx: Tx) {
    return tx.turno.updateMany({
      where: { id: args.turnoId, status: "IN_PROGRESS", guiaId: args.guiaId },
      data: { checkOutAt: args.now, status: "COMPLETED" },
    })
  }

  noShowIfStillAssigned(args: { turnoId: number; mergedObs: string }, tx: Tx) {
    return tx.turno.updateMany({
      where: { id: args.turnoId, status: "ASSIGNED" },
      data: { status: "NO_SHOW", observaciones: args.mergedObs },
    })
  }
}

export const turnoRepository = new TurnoRepository()