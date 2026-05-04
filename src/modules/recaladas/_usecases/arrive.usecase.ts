import type { Request } from "express"
import type { Prisma } from "@prisma/client"

import { BadRequestError, NotFoundError } from "../../../libs/errors"
import { logger } from "../../../libs/logger"

import { recaladaRepository } from "../_data/recalada.repository"
import { auditFail, auditOk } from "../_shared/recalada.audit"
import { emitRecaladaRealtime } from "../../../core/socket/domain-events"

export async function arriveRecaladaUsecase(
  req: Request,
  id: number,
  arrivedAt: Date | undefined,
  actorUserId: string,
) {
  const current = await recaladaRepository.findByIdForSimpleStatus(id)

  if (!current) {
    auditFail(
      req,
      "recaladas.arrive.failed",
      "Arrive recalada failed",
      { reason: "not_found", recaladaId: id },
      { entity: "Recalada", id: String(id) },
    )
    throw new NotFoundError("La recalada no existe")
  }

  if (current.operationalStatus === "DEPARTED") {
    auditFail(
      req,
      "recaladas.arrive.failed",
      "Arrive recalada failed",
      { reason: "already_departed", recaladaId: id },
      { entity: "Recalada", id: String(id) },
    )
    throw new BadRequestError(
      "No se puede marcar ARRIVED una recalada en estado DEPARTED",
    )
  }

  if (current.operationalStatus === "CANCELED") {
    auditFail(
      req,
      "recaladas.arrive.failed",
      "Arrive recalada failed",
      { reason: "canceled", recaladaId: id },
      { entity: "Recalada", id: String(id) },
    )
    throw new BadRequestError(
      "No se puede marcar ARRIVED una recalada en estado CANCELED",
    )
  }

  if (current.operationalStatus !== "SCHEDULED") {
    auditFail(
      req,
      "recaladas.arrive.failed",
      "Arrive recalada failed",
      {
        reason: "invalid_state",
        operationalStatus: current.operationalStatus,
        recaladaId: id,
      },
      { entity: "Recalada", id: String(id) },
    )
    throw new BadRequestError(
      "Solo se puede marcar ARRIVED si la recalada está en SCHEDULED",
    )
  }

  const now = new Date()
  const when = arrivedAt ?? now

  if (when > now) {
    auditFail(
      req,
      "recaladas.arrive.failed",
      "Arrive recalada failed",
      {
        reason: "arrivedAt_future",
        recaladaId: id,
        arrivedAt: when.toISOString(),
        now: now.toISOString(),
      },
      { entity: "Recalada", id: String(id) },
    )
    throw new BadRequestError("arrivedAt no puede ser una fecha futura")
  }

  // arrivedAt no puede ser más de 24 horas antes de la fechaLlegada programada
  if (current.fechaLlegada) {
    const toleranceMs = 24 * 60 * 60 * 1000
    const earliestAllowed = new Date(current.fechaLlegada.getTime() - toleranceMs)
    if (when < earliestAllowed) {
      auditFail(
        req,
        "recaladas.arrive.failed",
        "Arrive recalada failed",
        {
          reason: "arrivedAt_too_early",
          recaladaId: id,
          fechaLlegada: current.fechaLlegada.toISOString(),
          arrivedAt: when.toISOString(),
        },
        { entity: "Recalada", id: String(id) },
      )
      throw new BadRequestError(
        "El arribo real no puede registrarse más de 24 horas antes de la llegada programada.",
      )
    }
  }

  const data: Prisma.RecaladaUpdateInput = {
    operationalStatus: "ARRIVED",
    arrivedAt: when,
    canceledAt: null,
    cancelReason: null,
  }

  const updated = await recaladaRepository.update(id, data)

  logger.info(
    { recaladaId: id, actorUserId, arrivedAt: when.toISOString() },
    "[Recaladas] arrive",
  )

  auditOk(
    req,
    "recaladas.arrive.success",
    "Recalada arrived",
    { actorUserId, recaladaId: id, arrivedAt: when.toISOString() },
    { entity: "Recalada", id: String(id) },
  )

  emitRecaladaRealtime("recalada:arrived", {
    recaladaId: id,
    status: updated.status,
    operationalStatus: updated.operationalStatus,
  })

  return updated
}
