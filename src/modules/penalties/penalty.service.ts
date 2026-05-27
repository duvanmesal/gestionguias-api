import type { Request } from "express"

import { logsService } from "../../libs/logs/logs.service"
import { logger } from "../../libs/logger"
import { socketService } from "../../core/socket/socket.service"

import { operationalConfigService } from "../operational-config/operational-config.service"

import { penaltyRepository, type Tx } from "./penalty.repository"

export const PENALTY_DURATION_MIN_HOURS = 1
export const PENALTY_DURATION_MAX_HOURS = 720

export const PenaltyMotivo = {
  NO_SHOW: "NO_SHOW",
} as const

export type PenaltyMotivoType = (typeof PenaltyMotivo)[keyof typeof PenaltyMotivo]

export type ActivePenalty = {
  id: string
  guiaId: string
  turnoId: number | null
  reason: string
  motivo: string
  startsAt: Date
  expiresAt: Date
  createdById: string | null
}

/**
 * Epica 6 — Servicio centralizado de penalizaciones.
 * - Crea entidades persistentes `GuiaPenalty` con vigencia (`expiresAt`).
 * - Sincroniza `Guia.pendingPenalty` como indicador derivado (true mientras
 *   exista al menos una penalización vigente).
 * - Expone helpers de lectura para reglas de elegibilidad.
 */
export class PenaltyService {
  /**
   * Aplica una penalización NO_SHOW al guía y emite el evento realtime.
   * Devuelve la penalización persistida.
   */
  async applyNoShowPenalty(
    req: Request | undefined,
    args: {
      guiaId: string
      turnoId: number | null
      reason: string
      atencionId?: number | null
      /** Null cuando el actor es el job automático (sin usuario humano). */
      actorUserId: string | null
    },
    tx?: Tx,
  ): Promise<ActivePenalty> {
    const durationHours = await operationalConfigService.getNoShowPenaltyDurationHours()
    const startsAt = new Date()
    const expiresAt = new Date(startsAt.getTime() + durationHours * 60 * 60 * 1000)

    const penalty = await penaltyRepository.createWithSync(
      {
        guiaId: args.guiaId,
        turnoId: args.turnoId,
        reason: args.reason,
        motivo: PenaltyMotivo.NO_SHOW,
        startsAt,
        expiresAt,
        createdById: args.actorUserId,
      },
      tx,
    )

    logger.info(
      {
        guiaId: args.guiaId,
        turnoId: args.turnoId,
        atencionId: args.atencionId ?? null,
        durationHours,
        expiresAt,
        actorUserId: args.actorUserId,
      },
      "[Penalties] NO_SHOW penalty applied",
    )

    if (req) {
      logsService.audit(req, {
        event: "penalties.no_show.applied",
        message: "Penalización NO_SHOW aplicada",
        target: { entity: "GuiaPenalty", id: penalty.id },
        meta: {
          guiaId: args.guiaId,
          turnoId: args.turnoId,
          atencionId: args.atencionId ?? null,
          reason: args.reason,
          durationHours,
          startsAt: startsAt.toISOString(),
          expiresAt: expiresAt.toISOString(),
          actorUserId: args.actorUserId,
        },
      })
    }

    return penalty
  }

  /**
   * Devuelve la penalización vigente más reciente del guía, o null.
   * No modifica `pendingPenalty`.
   */
  findActiveForGuia(guiaId: string, now: Date = new Date(), tx?: Tx) {
    return penaltyRepository.findActiveForGuia(guiaId, now, tx)
  }

  /**
   * Map guiaId → ActivePenalty | undefined, útil para lookups en batch
   * (listados de usuarios/dashboard).
   */
  async mapActiveForGuias(
    guiaIds: string[],
    now: Date = new Date(),
    tx?: Tx,
  ): Promise<Map<string, ActivePenalty>> {
    const rows = await penaltyRepository.findActiveForGuias(guiaIds, now, tx)
    const map = new Map<string, ActivePenalty>()
    for (const row of rows) {
      // Conservar la más vigente (mayor expiresAt) — el repo ya ordena desc.
      if (!map.has(row.guiaId)) map.set(row.guiaId, row)
    }
    return map
  }

  /**
   * Evalúa elegibilidad operativa por penalización.
   * Si el guía tiene `pendingPenalty=true` pero ya no hay penalty vigente,
   * actualiza el flag a `false` (lazy sync) y reporta inactivo.
   *
   * Esto evita necesitar un cron job: cualquier camino caliente que llame
   * a esta función deja el flag consistente.
   */
  async isCurrentlyPenalized(
    args: { guiaId: string; pendingPenalty: boolean },
    now: Date = new Date(),
    tx?: Tx,
  ): Promise<{ penalized: boolean; activePenalty: ActivePenalty | null }> {
    if (!args.pendingPenalty) {
      return { penalized: false, activePenalty: null }
    }

    const active = await penaltyRepository.findActiveForGuia(args.guiaId, now, tx)
    if (active) {
      return { penalized: true, activePenalty: active }
    }

    // Flag obsoleto: limpiar.
    try {
      await penaltyRepository.clearPendingFlag(args.guiaId, tx)
    } catch (err) {
      logger.warn({ err, guiaId: args.guiaId }, "[Penalties] could not clear stale pendingPenalty")
    }
    return { penalized: false, activePenalty: null }
  }

  /**
   * Emite el evento realtime para informar al guía que fue penalizado.
   */
  notifyPenalized(args: {
    guiaUserId: string
    turnoId?: number | null
    atencionId?: number | null
    expiresAt: Date
    reason: string
  }): void {
    socketService.emitToGuia(args.guiaUserId, "disponibilidad:penalizado", {
      turnoId: args.turnoId ?? null,
      atencionId: args.atencionId ?? null,
      expiresAt: args.expiresAt.toISOString(),
      reason: args.reason,
      mensaje: "Fuiste penalizado por NO_SHOW. No podrás reclamar turnos hasta que la penalización expire.",
    })
  }

  listHistoryForGuia(args: { guiaId: string; page?: number; pageSize?: number }, tx?: Tx) {
    const page = args.page ?? 1
    const pageSize = args.pageSize ?? 20
    const skip = (page - 1) * pageSize
    return penaltyRepository.listHistoryForGuia({ guiaId: args.guiaId, skip, take: pageSize }, tx)
  }
}

export const penaltyService = new PenaltyService()
