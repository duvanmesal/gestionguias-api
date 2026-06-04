import type { Prisma } from "@prisma/client"

import { prisma } from "../../../prisma/client"
import {
  atencionSelect,
  turnoClaimSelect,
  turnoForAtencionListSelect,
} from "./atencion.select"

export type Tx = Prisma.TransactionClient

function db(tx?: Tx) {
  return tx ?? prisma
}

export class AtencionRepository {
  // -------------------------
  // Transactions
  // -------------------------
  transaction<T>(fn: (tx: Tx) => Promise<T>) {
    return prisma.$transaction(fn)
  }

  // -------------------------
  // Foreign keys / Actors
  // -------------------------
  findRecaladaByIdForAtencion(recaladaId: number, tx?: Tx) {
    return db(tx).recalada.findUnique({
      where: { id: recaladaId },
      select: {
        id: true,
        codigoRecalada: true,
        fechaLlegada: true,
        fechaSalida: true,
        status: true,
        operationalStatus: true,
      },
    })
  }

  findRecaladaBasic(recaladaId: number, tx?: Tx) {
    return db(tx).recalada.findUnique({
      where: { id: recaladaId },
      select: { id: true, codigoRecalada: true },
    })
  }

  findSupervisorByUserId(userId: string, tx?: Tx) {
    return db(tx).supervisor.findUnique({
      where: { usuarioId: userId },
      select: { id: true },
    })
  }

  createSupervisorForUser(userId: string, tx?: Tx) {
    return db(tx).supervisor.create({
      data: { usuarioId: userId },
      select: { id: true },
    })
  }

  findGuiaByUserId(userId: string, tx?: Tx) {
    return db(tx).guia.findUnique({
      where: { usuarioId: userId },
      select: {
        id: true,
        pendingPenalty: true,
        disponibleParaTurnos: true,
        disponibilidadUpdatedAt: true,
        usuario: { select: { activo: true } },
      },
    })
  }

  findActiveForGuia(guiaId: string, tx?: Tx) {
    return db(tx).turno.findFirst({
      where: { guiaId, status: "IN_PROGRESS" },
      select: { id: true },
    })
  }

  // -------------------------
  // Reads
  // -------------------------
  findById(id: number, tx?: Tx) {
    return db(tx).atencion.findUnique({ where: { id }, select: atencionSelect })
  }

  findByIdExists(id: number, tx?: Tx) {
    return db(tx).atencion.findUnique({ where: { id }, select: { id: true } })
  }

  findByIdForUpdate(id: number, tx?: Tx) {
    return db(tx).atencion.findUnique({
      where: { id },
      select: {
        id: true,
        recaladaId: true,
        turnosTotal: true,
        fechaInicio: true,
        fechaFin: true,
        status: true,
        operationalStatus: true,
      },
    })
  }

  findCapacityById(id: number, tx?: Tx) {
    return db(tx).atencion.findUnique({
      where: { id },
      select: {
        id: true,
        recaladaId: true,
        turnosTotal: true,
        status: true,
        operationalStatus: true,
        fechaFin: true,
      },
    })
  }

  findGateForCancel(id: number, tx?: Tx) {
    return db(tx).atencion.findUnique({
      where: { id },
      select: {
        id: true,
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
    })
  }

  findGateForClose(id: number, tx?: Tx) {
    return db(tx).atencion.findUnique({
      where: { id },
      select: {
        id: true,
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
    })
  }

  findGateForClaim(atencionId: number, tx?: Tx) {
    return db(tx).atencion.findUnique({
      where: { id: atencionId },
      select: {
        id: true,
        status: true,
        operationalStatus: true,
        recalada: {
          select: { status: true, operationalStatus: true },
        },
      },
    })
  }

  // -------------------------
  // Lists
  // -------------------------
  count(where: Prisma.AtencionWhereInput) {
    return prisma.atencion.count({ where })
  }

  list(args: { where: Prisma.AtencionWhereInput; skip: number; take: number }) {
    return prisma.atencion.findMany({
      where: args.where,
      select: atencionSelect,
      orderBy: { fechaInicio: "asc" },
      skip: args.skip,
      take: args.take,
    })
  }

  listByRecaladaId(recaladaId: number, tx?: Tx) {
    return db(tx).atencion.findMany({
      where: { recaladaId },
      select: atencionSelect,
      orderBy: { fechaInicio: "asc" },
    })
  }

  // -------------------------
  // Validations (DB)
  // -------------------------
  findOverlapActive(args: {
    recaladaId: number
    fechaInicio: Date
    fechaFin: Date
    excludeId?: number
  }) {
    return prisma.atencion.findFirst({
      where: {
        recaladaId: args.recaladaId,
        ...(typeof args.excludeId === "number" ? { id: { not: args.excludeId } } : {}),
        status: "ACTIVO",
        operationalStatus: { not: "CANCELED" },
        AND: [{ fechaInicio: { lt: args.fechaFin } }, { fechaFin: { gt: args.fechaInicio } }],
      },
      select: { id: true, fechaInicio: true, fechaFin: true },
    })
  }

  // -------------------------
  // Mutations
  // -------------------------
  async createWithTurnosAtomic(args: {
    recaladaId: number
    supervisorId: string
    turnosTotal: number
    descripcion?: string | null
    fechaInicio: Date
    fechaFin: Date
    actorUserId: string
  }) {
    return prisma.$transaction(async (tx) => {
      const atencion = await tx.atencion.create({
        data: {
          recaladaId: args.recaladaId,
          supervisorId: args.supervisorId,
          turnosTotal: args.turnosTotal,
          descripcion: args.descripcion ?? null,
          fechaInicio: args.fechaInicio,
          fechaFin: args.fechaFin,
          createdById: args.actorUserId,
        },
        select: { id: true, turnosTotal: true, fechaInicio: true, fechaFin: true },
      })

      const turnosData = Array.from({ length: atencion.turnosTotal }, (_, i) => ({
        atencionId: atencion.id,
        numero: i + 1,
        fechaInicio: atencion.fechaInicio,
        fechaFin: atencion.fechaFin,
        createdById: args.actorUserId,
      }))

      await tx.turno.createMany({ data: turnosData, skipDuplicates: false })

      return tx.atencion.findUnique({ where: { id: atencion.id }, select: atencionSelect })
    })
  }

  async updateWithTurnosAtomic(args: {
    id: number
    patch: Prisma.AtencionUpdateInput
    turnosTotal?: number
    oldTotal: number
    newTotal: number
    windowChanged: boolean
    newFechaInicio: Date
    newFechaFin: Date
    actorUserId: string
  }) {
    return prisma.$transaction(async (tx) => {
      await tx.atencion.update({
        where: { id: args.id },
        data: {
          ...args.patch,
          ...(typeof args.turnosTotal === "number" ? { turnosTotal: args.turnosTotal } : {}),
        },
        select: { id: true },
      })

      if (args.windowChanged) {
        await tx.turno.updateMany({
          where: { atencionId: args.id, guiaId: null },
          data: { fechaInicio: args.newFechaInicio, fechaFin: args.newFechaFin },
        })
      }

      if (args.newTotal > args.oldTotal) {
        const toCreate = Array.from({ length: args.newTotal - args.oldTotal }, (_, i) => ({
          atencionId: args.id,
          numero: args.oldTotal + i + 1,
          fechaInicio: args.newFechaInicio,
          fechaFin: args.newFechaFin,
          createdById: args.actorUserId,
        }))
        await tx.turno.createMany({ data: toCreate, skipDuplicates: false })
      }

      if (args.newTotal < args.oldTotal) {
        const extraTurnos = await tx.turno.findMany({
          where: { atencionId: args.id, numero: { gt: args.newTotal } },
          select: { id: true, numero: true, guiaId: true },
          orderBy: { numero: "asc" },
        })

        const assigned = extraTurnos.filter((t) => t.guiaId !== null)
        if (assigned.length > 0) {
          // Se deja como ConflictError a nivel usecase (para mantener separación),
          // pero esto se ejecuta dentro de la TX. Lanza un error genérico y el usecase lo traduce.
          throw Object.assign(new Error("ATENCION_REDUCE_ASSIGNED_TURNOS"), {
            code: "ATENCION_REDUCE_ASSIGNED_TURNOS",
            detail: { newTotal: args.newTotal },
          })
        }

        await tx.turno.deleteMany({
          where: { atencionId: args.id, numero: { gt: args.newTotal } },
        })
      }

      return tx.atencion.findUnique({ where: { id: args.id }, select: atencionSelect })
    })
  }

  cancelAtencionAtomic(args: { id: number; reason: string; actorUserId: string; when: Date }) {
    return prisma.$transaction(async (tx) => {
      await tx.turno.updateMany({
        where: { atencionId: args.id, status: { in: ["AVAILABLE", "ASSIGNED"] } },
        data: {
          status: "CANCELED",
          canceledAt: args.when,
          cancelReason: args.reason,
          canceledById: args.actorUserId,
        },
      })

      return tx.atencion.update({
        where: { id: args.id },
        data: {
          operationalStatus: "CANCELED",
          canceledAt: args.when,
          cancelReason: args.reason,
          canceledById: args.actorUserId,
        },
        select: atencionSelect,
      })
    })
  }

  closeAtencion(args: { id: number }, tx?: Tx) {
    return db(tx).atencion.update({
      where: { id: args.id },
      data: { operationalStatus: "CLOSED" },
      select: atencionSelect,
    })
  }

  upsertEvaluation(
    args: {
      atencionId: number
      calificacion: number
      estadoFinal: "SATISFACTORIA" | "CON_NOVEDADES" | "NO_SATISFACTORIA"
      observaciones?: string | null
      evaluatedById: string
      evaluatedAt: Date
    },
    tx?: Tx,
  ) {
    return db(tx).atencionEvaluation.upsert({
      where: { atencionId: args.atencionId },
      create: {
        atencionId: args.atencionId,
        calificacion: args.calificacion,
        estadoFinal: args.estadoFinal,
        observaciones: args.observaciones ?? null,
        evaluatedById: args.evaluatedById,
        evaluatedAt: args.evaluatedAt,
      },
      update: {
        calificacion: args.calificacion,
        estadoFinal: args.estadoFinal,
        observaciones: args.observaciones ?? null,
        evaluatedById: args.evaluatedById,
        evaluatedAt: args.evaluatedAt,
      },
    })
  }

  closeAtencionWithEvaluation(
    args: {
      id: number
      evaluation: {
        calificacion: number
        estadoFinal: "SATISFACTORIA" | "CON_NOVEDADES" | "NO_SATISFACTORIA"
        observaciones?: string | null
      }
      actorUserId: string
      evaluatedAt: Date
    },
  ) {
    return prisma.$transaction(async (tx) => {
      await tx.atencion.update({
        where: { id: args.id },
        data: { operationalStatus: "CLOSED" },
        select: { id: true },
      })

      await this.upsertEvaluation(
        {
          atencionId: args.id,
          calificacion: args.evaluation.calificacion,
          estadoFinal: args.evaluation.estadoFinal,
          observaciones: args.evaluation.observaciones,
          evaluatedById: args.actorUserId,
          evaluatedAt: args.evaluatedAt,
        },
        tx,
      )

      return tx.atencion.findUnique({ where: { id: args.id }, select: atencionSelect })
    })
  }

  // -------------------------
  // Turnos helpers
  // -------------------------
  listTurnosByAtencionId(atencionId: number, tx?: Tx) {
    return db(tx).turno.findMany({
      where: { atencionId },
      orderBy: { numero: "asc" },
      select: turnoForAtencionListSelect,
    })
  }

  countTurnosInProgress(atencionId: number, tx?: Tx) {
    return db(tx).turno.count({ where: { atencionId, status: "IN_PROGRESS" } })
  }

  countTurnosAlive(atencionId: number, tx?: Tx) {
    return db(tx).turno.count({
      where: { atencionId, status: { in: ["AVAILABLE", "ASSIGNED", "IN_PROGRESS"] } },
    })
  }

  countTurnosAssignedOrInProgress(atencionId: number, tx?: Tx) {
    return db(tx).turno.count({
      where: { atencionId, status: { in: ["ASSIGNED", "IN_PROGRESS"] } },
    })
  }

  listAssignedTurnosForRealtime(atencionId: number, tx?: Tx) {
    return db(tx).turno.findMany({
      where: { atencionId, status: "ASSIGNED", guiaId: { not: null } },
      select: {
        id: true,
        atencionId: true,
        guiaId: true,
        status: true,
        atencion: { select: { recaladaId: true } },
        guia: { select: { usuario: { select: { id: true } } } },
      },
    })
  }

  getSummaryAtencion(atencionId: number, tx?: Tx) {
    return db(tx).atencion.findUnique({
      where: { id: atencionId },
      select: { id: true, turnosTotal: true },
    })
  }

  groupTurnosByStatus(atencionId: number, tx?: Tx) {
    return db(tx).turno.groupBy({
      by: ["status"],
      where: { atencionId },
      _count: { _all: true },
    })
  }

  // -------------------------
  // Claim helpers (TX)
  // -------------------------
  findExistingTurnoForGuia(atencionId: number, guiaId: string, tx?: Tx) {
    return db(tx).turno.findFirst({ where: { atencionId, guiaId }, select: { id: true } })
  }

  findFirstAvailableTurno(atencionId: number, tx?: Tx) {
    return db(tx).turno.findFirst({
      where: { atencionId, status: "AVAILABLE", guiaId: null },
      orderBy: { numero: "asc" },
      select: { id: true, numero: true, fechaInicio: true, fechaFin: true },
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

  assignTurnoIfStillAvailable(args: { turnoId: number; guiaId: string }, tx?: Tx) {
    return db(tx).turno.updateMany({
      where: { id: args.turnoId, status: "AVAILABLE", guiaId: null },
      data: { guiaId: args.guiaId, status: "ASSIGNED" },
    })
  }

  getTurnoClaimDetail(turnoId: number, tx?: Tx) {
    return db(tx).turno.findUnique({ where: { id: turnoId }, select: turnoClaimSelect })
  }
}

export const atencionRepository = new AtencionRepository()
