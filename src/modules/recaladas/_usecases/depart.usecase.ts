import type { Request } from "express"
import type { Prisma } from "@prisma/client"

import { BadRequestError, ConflictError, NotFoundError } from "../../../libs/errors"
import { logger } from "../../../libs/logger"

import { recaladaRepository } from "../_data/recalada.repository"
import { auditFail, auditOk } from "../_shared/recalada.audit"
import { emitRecaladaRealtime } from "../../../core/socket/domain-events"

export async function departRecaladaUsecase(
  req: Request,
  id: number,
  departedAt: Date | undefined,
  actorUserId: string,
) {
  const current = await recaladaRepository.findByIdForDepart(id)

  if (!current) {
    auditFail(
      req,
      "recaladas.depart.failed",
      "Depart recalada failed",
      { reason: "not_found", recaladaId: id },
      { entity: "Recalada", id: String(id) },
    )
    throw new NotFoundError("La recalada no existe")
  }

  if (current.operationalStatus === "CANCELED") {
    auditFail(
      req,
      "recaladas.depart.failed",
      "Depart recalada failed",
      { reason: "canceled", recaladaId: id },
      { entity: "Recalada", id: String(id) },
    )
    throw new BadRequestError(
      "No se puede marcar DEPARTED una recalada en estado CANCELED",
    )
  }

  if (current.operationalStatus === "DEPARTED") {
    auditFail(
      req,
      "recaladas.depart.failed",
      "Depart recalada failed",
      { reason: "already_departed", recaladaId: id },
      { entity: "Recalada", id: String(id) },
    )
    throw new BadRequestError("La recalada ya está en DEPARTED")
  }

  if (current.operationalStatus !== "ARRIVED") {
    auditFail(
      req,
      "recaladas.depart.failed",
      "Depart recalada failed",
      {
        reason: "invalid_state",
        operationalStatus: current.operationalStatus,
        recaladaId: id,
      },
      { entity: "Recalada", id: String(id) },
    )
    throw new BadRequestError(
      "Solo se puede marcar DEPARTED si la recalada está en ARRIVED",
    )
  }

  const now = new Date()
  const when = departedAt ?? now

  if (when > now) {
    auditFail(
      req,
      "recaladas.depart.failed",
      "Depart recalada failed",
      {
        reason: "departedAt_future",
        recaladaId: id,
        departedAt: when.toISOString(),
        now: now.toISOString(),
      },
      { entity: "Recalada", id: String(id) },
    )
    throw new BadRequestError("departedAt no puede ser una fecha futura")
  }

  if (current.arrivedAt && when <= current.arrivedAt) {
    auditFail(
      req,
      "recaladas.depart.failed",
      "Depart recalada failed",
      {
        reason: "departedAt_lte_arrivedAt",
        recaladaId: id,
        arrivedAt: current.arrivedAt.toISOString(),
        departedAt: when.toISOString(),
      },
      { entity: "Recalada", id: String(id) },
    )
    throw new BadRequestError(
      "El zarpe real debe ser posterior al arribo real. El buque no puede zarpar en el mismo instante en que llegó.",
    )
  }

  // El zarpe real no puede registrarse más de 24 horas antes de la salida programada
  if (current.fechaSalida) {
    const toleranceMs = 24 * 60 * 60 * 1000
    const earliestAllowed = new Date(current.fechaSalida.getTime() - toleranceMs)
    if (when < earliestAllowed) {
      auditFail(
        req,
        "recaladas.depart.failed",
        "Depart recalada failed",
        {
          reason: "departedAt_too_early",
          recaladaId: id,
          fechaSalida: current.fechaSalida.toISOString(),
          departedAt: when.toISOString(),
        },
        { entity: "Recalada", id: String(id) },
      )
      throw new BadRequestError(
        "El zarpe real no puede registrarse más de 24 horas antes de la salida programada.",
      )
    }
  }

  const openAtenciones = await recaladaRepository.countOpenAtenciones(id)
  if (openAtenciones > 0) {
    auditFail(
      req,
      "recaladas.depart.failed",
      "Depart recalada failed",
      { reason: "has_open_atenciones", recaladaId: id, openAtenciones },
      { entity: "Recalada", id: String(id) },
    )
    throw new ConflictError(
      `No se puede marcar DEPARTED: existen ${openAtenciones} atención(es) aún abiertas. Ciérralas o cancélalas primero.`,
    )
  }

  const data: Prisma.RecaladaUpdateInput = {
    operationalStatus: "DEPARTED",
    departedAt: when,
  }

  const updated = await recaladaRepository.update(id, data)

  logger.info(
    { recaladaId: id, actorUserId, departedAt: when.toISOString() },
    "[Recaladas] depart",
  )

  auditOk(
    req,
    "recaladas.depart.success",
    "Recalada departed",
    { actorUserId, recaladaId: id, departedAt: when.toISOString() },
    { entity: "Recalada", id: String(id) },
  )

  emitRecaladaRealtime("recalada:departed", {
    recaladaId: id,
    status: updated.status,
    operationalStatus: updated.operationalStatus,
  })

  return updated
}
