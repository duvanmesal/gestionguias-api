import type { Request } from "express"
import type { Prisma } from "@prisma/client"

import { BadRequestError, NotFoundError } from "../../../libs/errors"
import { logger } from "../../../libs/logger"

import { recaladaRepository } from "../_data/recalada.repository"
import { auditFail, auditOk } from "../_shared/recalada.audit"

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

  const when = arrivedAt ?? new Date()

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

  return updated
}