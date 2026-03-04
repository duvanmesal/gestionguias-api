import type { Request } from "express"
import type { Prisma } from "@prisma/client"

import { BadRequestError, NotFoundError } from "../../../libs/errors"
import { logger } from "../../../libs/logger"

import { recaladaRepository } from "../_data/recalada.repository"
import { buildUpdateData } from "../_domain/recalada.rules"
import type { UpdateRecaladaInput } from "../_domain/recalada.types"
import { auditFail, auditOk } from "../_shared/recalada.audit"

export async function updateRecaladaUsecase(
  req: Request,
  id: number,
  input: UpdateRecaladaInput,
  actorUserId: string,
) {
  const current = await recaladaRepository.findByIdForUpdate(id)

  if (!current) {
    auditFail(
      req,
      "recaladas.update.failed",
      "Update recalada failed",
      { reason: "not_found", recaladaId: id },
      { entity: "Recalada", id: String(id) },
    )
    throw new NotFoundError("La recalada no existe")
  }

  if (current.operationalStatus === "DEPARTED" || current.operationalStatus === "CANCELED") {
    auditFail(
      req,
      "recaladas.update.failed",
      "Update recalada failed",
      {
        reason: "invalid_operational_status",
        operationalStatus: current.operationalStatus,
        recaladaId: id,
      },
      { entity: "Recalada", id: String(id) },
    )
    throw new BadRequestError(
      "No se puede editar una recalada en estado DEPARTED o CANCELED",
    )
  }

  let built: { data: Prisma.RecaladaUpdateInput; updatedKeys: string[] }

  try {
    built = buildUpdateData({
      current: {
        operationalStatus: current.operationalStatus,
        fechaLlegada: current.fechaLlegada,
        fechaSalida: current.fechaSalida,
      },
      input: input as unknown as Record<string, any>,
    })
  } catch (err: any) {
    const msg = String(err?.message ?? "")

    auditFail(
      req,
      "recaladas.update.failed",
      "Update recalada failed",
      {
        reason:
          msg.includes("No hay campos permitidos")
            ? "no_allowed_fields"
            : msg.includes("fechaSalida")
              ? "fechaSalida_lt_fechaLlegada"
              : "bad_request",
        operationalStatus: current.operationalStatus,
        recaladaId: id,
        message: msg,
      },
      { entity: "Recalada", id: String(id) },
    )

    throw err
  }

  const data = built.data

  // Validar FK si cambian
  const nextBuqueId = (data as any).buqueId as number | undefined
  if (typeof nextBuqueId === "number") {
    const buque = await recaladaRepository.findBuqueById(nextBuqueId)
    if (!buque) {
      auditFail(
        req,
        "recaladas.update.failed",
        "Update recalada failed",
        { reason: "buque_not_found", buqueId: nextBuqueId, recaladaId: id },
        { entity: "Recalada", id: String(id) },
      )
      throw new NotFoundError("El buque (buqueId) no existe")
    }
  }

  const nextPaisOrigenId = (data as any).paisOrigenId as number | undefined
  if (typeof nextPaisOrigenId === "number") {
    const pais = await recaladaRepository.findPaisById(nextPaisOrigenId)
    if (!pais) {
      auditFail(
        req,
        "recaladas.update.failed",
        "Update recalada failed",
        {
          reason: "paisOrigen_not_found",
          paisOrigenId: nextPaisOrigenId,
          recaladaId: id,
        },
        { entity: "Recalada", id: String(id) },
      )
      throw new NotFoundError("El país (paisOrigenId) no existe")
    }
  }

  const updated = await recaladaRepository.update(id, data)

  logger.info(
    {
      recaladaId: id,
      actorUserId,
      operationalStatus: current.operationalStatus,
      updatedKeys: built.updatedKeys,
    },
    "[Recaladas] update",
  )

  auditOk(
    req,
    "recaladas.update.success",
    "Recalada updated",
    {
      actorUserId,
      recaladaId: id,
      operationalStatusBefore: current.operationalStatus,
      updatedKeys: built.updatedKeys,
    },
    { entity: "Recalada", id: String(id) },
  )

  return updated
}