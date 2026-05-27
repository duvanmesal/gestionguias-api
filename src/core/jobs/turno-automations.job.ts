import { turnoRepository } from "../../modules/turnos/_data/turno.repository"
import { NO_SHOW_GRACE_MS, AUTO_COMPLETE_MARGIN_MS } from "../../modules/turnos/_domain/turno.rules"
import { penaltyService } from "../../modules/penalties/penalty.service"
import { emitTurnoRealtime } from "../socket/domain-events"
import { logger } from "../../libs/logger"

const JOB_INTERVAL_MS = 60 * 1000 // cada 1 minuto

export function startTurnoAutomationsJob() {
  setInterval(runAutomations, JOB_INTERVAL_MS)
  logger.info("[Job] turno-automations iniciado")
}

async function runAutomations() {
  try {
    await applyAutoNoShow()
    await applyAutoComplete()
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
      await penaltyService.applyNoShowPenalty(undefined, {
        guiaId: t.guiaId,
        turnoId: t.id,
        reason: "NO_SHOW automático por inasistencia tras ventana de gracia",
        atencionId: t.atencionId,
        actorUserId: null,
      })
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
