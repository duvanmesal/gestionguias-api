import type { Prisma } from "@prisma/client"

import { prisma } from "../../prisma/client"

export type Tx = Prisma.TransactionClient

function db(tx?: Tx) {
  return tx ?? prisma
}

export const penaltySelect = {
  id: true,
  guiaId: true,
  turnoId: true,
  reason: true,
  motivo: true,
  startsAt: true,
  expiresAt: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
} as const

export const penaltyRepository = {
  /**
   * Crea una penalización para un guía y sincroniza `Guia.pendingPenalty=true`.
   * Atomicidad: si se pasa una tx, se usa; si no, se ejecuta una nueva.
   */
  async createWithSync(
    args: {
      guiaId: string
      turnoId: number | null
      reason: string
      motivo: string
      startsAt: Date
      expiresAt: Date
      createdById: string | null
    },
    tx?: Tx,
  ) {
    const run = async (client: Tx | typeof prisma) => {
      const penalty = await client.guiaPenalty.create({
        data: {
          guiaId: args.guiaId,
          turnoId: args.turnoId,
          reason: args.reason,
          motivo: args.motivo,
          startsAt: args.startsAt,
          expiresAt: args.expiresAt,
          createdById: args.createdById ?? undefined,
        },
        select: penaltySelect,
      })

      await client.guia.update({
        where: { id: args.guiaId },
        data: { pendingPenalty: true },
      })

      return penalty
    }

    if (tx) return run(tx)
    return prisma.$transaction((t) => run(t))
  },

  findActiveForGuia(guiaId: string, now: Date = new Date(), tx?: Tx) {
    return db(tx).guiaPenalty.findFirst({
      where: { guiaId, expiresAt: { gt: now } },
      orderBy: { expiresAt: "desc" },
      select: penaltySelect,
    })
  },

  findActiveForGuias(guiaIds: string[], now: Date = new Date(), tx?: Tx) {
    if (guiaIds.length === 0) return Promise.resolve([])
    return db(tx).guiaPenalty.findMany({
      where: { guiaId: { in: guiaIds }, expiresAt: { gt: now } },
      orderBy: { expiresAt: "desc" },
      select: penaltySelect,
    })
  },

  countActive(now: Date = new Date(), tx?: Tx) {
    return db(tx).guiaPenalty.count({
      where: { expiresAt: { gt: now } },
    })
  },

  async listHistoryForGuia(
    args: { guiaId: string; skip: number; take: number },
    tx?: Tx,
  ) {
    const client = db(tx)
    const [total, items] = await Promise.all([
      client.guiaPenalty.count({ where: { guiaId: args.guiaId } }),
      client.guiaPenalty.findMany({
        where: { guiaId: args.guiaId },
        orderBy: { startsAt: "desc" },
        select: penaltySelect,
        skip: args.skip,
        take: args.take,
      }),
    ])
    return [total, items] as const
  },

  clearPendingFlag(guiaId: string, tx?: Tx) {
    return db(tx).guia.update({
      where: { id: guiaId },
      data: { pendingPenalty: false },
    })
  },
}
