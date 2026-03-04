import type { Request } from "express"
import type { Prisma } from "@prisma/client"

import { BadRequestError, NotFoundError } from "../../../libs/errors"
import { logger } from "../../../libs/logger"

import { recaladaRepository } from "../_data/recalada.repository"
import { auditFail, auditOk } from "../_shared/recalada.audit"

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

  const when = departedAt ?? new Date()

  if (current.arrivedAt && when < current.arrivedAt) {
    auditFail(
      req,
      "recaladas.depart.failed",
      "Depart recalada failed",
      {
        reason: "departedAt_lt_arrivedAt",
        recaladaId: id,
        arrivedAt: current.arrivedAt.toISOString(),
        departedAt: when.toISOString(),
      },
      { entity: "Recalada", id: String(id) },
    )
    throw new BadRequestError("departedAt debe ser >= arrivedAt")
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

  return updated
}