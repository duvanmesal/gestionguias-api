import { turnoRepository } from "../../modules/turnos/_data/turno.repository"
import { NO_SHOW_GRACE_MS, AUTO_COMPLETE_MARGIN_MS } from "../../modules/turnos/_domain/turno.rules"
import { penaltyService } from "../../modules/penalties/penalty.service"
import { emitTurnoRealtime } from "../socket/domain-events"
import { logger } from "../../libs/logger"
import { prisma } from "../../prisma/client"
import {
  notifyRecaladaOverdue,
  notifyAtencionNearWithFreeTurnos,
} from "../../modules/notifications/operational-notifications"

const JOB_INTERVAL_MS = 60 * 1000 // cada 1 minuto

export function startTurnoAutomationsJob() {
  setInterval(runAutomations, JOB_INTERVAL_MS)
  logger.info("[Job] turno-automations iniciado")
}

async function runAutomations() {
  try {
    await applyAutoNoShow()
    await applyAutoComplete()
    await notifyRecaladasOverdue()
    await notifyAtencionesNearWithFreeTurnos()
  } catch (err) {
    logger.error(err, "[Job] turno-automations error")
  }
}

async function applyAutoNoShow() {
  const expired = await turnoRepository.findExpiredAssigned(NO_SHOW_GRACE_MS)
  if (expired.length === 0) return

  const ids = expired.map((t) => t.id)
  await turnoRepository.bulkNoShow(ids, new Date())

  // Epica 6 — aplicar la misma penalización persistente que el NO_SHOW manual.
  // Sin actor humano: `createdById = null`.
  for (const t of expired) {
    if (!t.guiaId) continue
    try {
      const penalty = await penaltyService.applyNoShowPenalty(undefined, {
        guiaId: t.guiaId,
        turnoId: t.id,
        reason: "NO_SHOW automático por inasistencia tras ventana de gracia",
        atencionId: t.atencionId,
        actorUserId: null,
      })

      // Epica 7 — notificar al guía la penalización.
      const guia = await prisma.guia.findUnique({
        where: { id: t.guiaId },
        select: { usuario: { select: { id: true } } },
      })
      if (guia?.usuario?.id) {
        penaltyService.notifyPenalized({
          guiaId: t.guiaId,
          guiaUserId: guia.usuario.id,
          penaltyId: penalty.id,
          turnoId: t.id,
          atencionId: t.atencionId,
          expiresAt: penalty.expiresAt,
          reason: penalty.reason,
        })
      }
    } catch (err) {
      logger.error(
        { err, turnoId: t.id, guiaId: t.guiaId },
        "[Job] error aplicando penalización NO_SHOW automático",
      )
    }
  }

  for (const t of expired) {
    emitTurnoRealtime("turno:noShow", { ...t, status: "NO_SHOW" }, { meta: { source: "job" } })
  }

  logger.info({ count: ids.length, ids }, "[Job] NO_SHOW automático aplicado")
}

/**
 * Epica 7 — HU-24: alerta de recaladas vencidas sin zarpe.
 * Deduplicada por recalada gracias al notificationId estable.
 */
async function notifyRecaladasOverdue() {
  const now = new Date()
  const overdue = await prisma.recalada.findMany({
    where: {
      fechaSalida: { lt: now },
      operationalStatus: { in: ["SCHEDULED", "ARRIVED"] },
      status: { in: ["ACTIVO", "SUSPENDIDO"] },
    },
    select: { id: true, codigoRecalada: true, fechaSalida: true },
    take: 50,
  })

  for (const r of overdue) {
    if (!r.fechaSalida) continue
    try {
      await notifyRecaladaOverdue({
        recaladaId: r.id,
        codigoRecalada: r.codigoRecalada,
        fechaSalida: r.fechaSalida,
      })
    } catch (err) {
      logger.error({ err, recaladaId: r.id }, "[Job] error notificando recalada vencida")
    }
  }
}

/**
 * Epica 7 — HU-24: alerta de atenciones próximas (dentro de 2h) con turnos
 * disponibles sin reclamar. Deduplicada por atención.
 */
const NEAR_WINDOW_MS = 2 * 60 * 60 * 1000

async function notifyAtencionesNearWithFreeTurnos() {
  const now = new Date()
  const upperBound = new Date(now.getTime() + NEAR_WINDOW_MS)

  const candidates = await prisma.atencion.findMany({
    where: {
      status: "ACTIVO",
      operationalStatus: "OPEN",
      fechaInicio: { gte: now, lte: upperBound },
    },
    select: {
      id: true,
      recaladaId: true,
      fechaInicio: true,
      recalada: { select: { codigoRecalada: true } },
      turnos: {
        where: { status: "AVAILABLE", guiaId: null },
        select: { id: true },
      },
    },
    take: 50,
  })

  for (const a of candidates) {
    if (a.turnos.length === 0) continue
    try {
      await notifyAtencionNearWithFreeTurnos({
        atencionId: a.id,
        recaladaId: a.recaladaId,
        codigoRecalada: a.recalada?.codigoRecalada ?? null,
        fechaInicio: a.fechaInicio,
        turnosLibres: a.turnos.length,
      })
    } catch (err) {
      logger.error({ err, atencionId: a.id }, "[Job] error notificando atencion proxima con turnos libres")
    }
  }
}

async function applyAutoComplete() {
  const expired = await turnoRepository.findExpiredInProgress(AUTO_COMPLETE_MARGIN_MS)
  if (expired.length === 0) return

  const now = new Date()
  const ids = expired.map((t) => t.id)
  await turnoRepository.bulkAutoComplete(ids, now)

  for (const t of expired) {
    emitTurnoRealtime("turno:checkedOut", { ...t, status: "COMPLETED" }, { meta: { source: "job" } })
  }

  logger.info({ count: ids.length, ids }, "[Job] COMPLETED automático aplicado")
}
