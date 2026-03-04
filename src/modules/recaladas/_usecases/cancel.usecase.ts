import type { Request } from "express"
import type { Prisma, RolType } from "@prisma/client"

import { BadRequestError, NotFoundError } from "../../../libs/errors"
import { logger } from "../../../libs/logger"

import { recaladaRepository } from "../_data/recalada.repository"
import { auditFail, auditOk } from "../_shared/recalada.audit"

export async function cancelRecaladaUsecase(
  req: Request,
  id: number,
  reason: string | undefined,
  actorUserId: string,
  actorRol: RolType | undefined,
) {
  const current = await recaladaRepository.findByIdForSimpleStatus(id)

  if (!current) {
    auditFail(
      req,
      "recaladas.cancel.failed",
      "Cancel recalada failed",
      { reason: "not_found", recaladaId: id },
      { entity: "Recalada", id: String(id) },
    )
    throw new NotFoundError("La recalada no existe")
  }

  if (current.operationalStatus === "DEPARTED") {
    auditFail(
      req,
      "recaladas.cancel.failed",
      "Cancel recalada failed",
      { reason: "already_departed", recaladaId: id },
      { entity: "Recalada", id: String(id) },
    )
    throw new BadRequestError(
      "No se puede cancelar una recalada en estado DEPARTED",
    )
  }

  if (current.operationalStatus === "CANCELED") {
    auditFail(
      req,
      "recaladas.cancel.failed",
      "Cancel recalada failed",
      { reason: "already_canceled", recaladaId: id },
      { entity: "Recalada", id: String(id) },
    )
    throw new BadRequestError("La recalada ya está en estado CANCELED")
  }

  if (current.operationalStatus === "ARRIVED") {
    if (!actorRol) {
      auditFail(
        req,
        "recaladas.cancel.failed",
        "Cancel recalada failed",
        { reason: "missing_actor_role", recaladaId: id },
        { entity: "Recalada", id: String(id) },
      )
      throw new BadRequestError("No se pudo determinar el rol del usuario")
    }

    if (actorRol !== "SUPER_ADMIN") {
      auditFail(
        req,
        "recaladas.cancel.failed",
        "Cancel recalada failed",
        { reason: "role_not_allowed", required: "SUPER_ADMIN", actorRol, recaladaId: id },
        { entity: "Recalada", id: String(id) },
      )
      throw new BadRequestError(
        "Solo SUPER_ADMIN puede cancelar una recalada que ya ARRIVED",
      )
    }
  }

  const [atencionesCount, turnosCount] = await Promise.all([
    recaladaRepository.countAtenciones(id),
    recaladaRepository.countTurnos(id),
  ])

  if (atencionesCount > 0 || turnosCount > 0) {
    auditFail(
      req,
      "recaladas.cancel.failed",
      "Cancel recalada failed",
      { reason: "has_dependencies", recaladaId: id, atencionesCount, turnosCount },
      { entity: "Recalada", id: String(id) },
    )
    throw new BadRequestError(
      "No se puede cancelar la recalada porque tiene atenciones/turnos asociados. Defina política de cascada (cancelar o bloquear) para habilitar esta acción.",
    )
  }

  const when = new Date()

  const data: Prisma.RecaladaUpdateInput = {
    operationalStatus: "CANCELED",
    canceledAt: when,
    cancelReason: reason ?? null,
  }

  const updated = await recaladaRepository.update(id, data)

  logger.info(
    {
      recaladaId: id,
      actorUserId,
      actorRol,
      canceledAt: when.toISOString(),
    },
    "[Recaladas] cancel",
  )

  auditOk(
    req,
    "recaladas.cancel.success",
    "Recalada canceled",
    {
      actorUserId,
      actorRol,
      recaladaId: id,
      canceledAt: when.toISOString(),
      cancelReason: reason ?? null,
    },
    { entity: "Recalada", id: String(id) },
  )

  return updated
}