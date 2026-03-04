import type { Request } from "express"
import type { Prisma } from "@prisma/client"

import { logger } from "../../../libs/logger"
import { BadRequestError, ConflictError, NotFoundError } from "../../../libs/errors"

import type { UpdateAtencionBody } from "../atencion.schemas"

import { atencionRepository } from "../_data/atencion.repository"
import {
  assertAtencionEditable,
  assertRecaladaOperable,
  assertTurnosTotalValid,
  assertWindowDatesValid,
  assertWindowNotPast,
  assertWindowWithinRecalada,
} from "../_domain/atencion.rules"
import { auditFail, auditOk } from "../_shared/atencion.audit"

export async function updateAtencionUsecase(
  req: Request,
  id: number,
  body: UpdateAtencionBody,
  actorUserId: string,
) {
  const current = await atencionRepository.findByIdForUpdate(id)

  if (!current) {
    auditFail(
      req,
      "atenciones.update.failed",
      "Update atencion failed",
      { reason: "not_found", atencionId: id },
      { entity: "Atencion", id: String(id) },
    )
    throw new NotFoundError("Atención no encontrada")
  }

  try {
    assertAtencionEditable(current.operationalStatus)
  } catch (e: any) {
    auditFail(
      req,
      "atenciones.update.failed",
      "Update atencion failed",
      { reason: "already_canceled", atencionId: id },
      { entity: "Atencion", id: String(id) },
    )
    throw e
  }

  const patch: Prisma.AtencionUpdateInput = {}

  const newFechaInicio = body.fechaInicio ?? current.fechaInicio
  const newFechaFin = body.fechaFin ?? current.fechaFin

  try {
    assertWindowDatesValid(newFechaInicio, newFechaFin)
  } catch (e: any) {
    auditFail(
      req,
      "atenciones.update.failed",
      "Update atencion failed",
      { reason: "fechaFin_lt_fechaInicio", atencionId: id },
      { entity: "Atencion", id: String(id) },
    )
    throw e
  }

  // ✅ FIX: ahora SIEMPRE es boolean (porque newFechaInicio/newFechaFin son Date)
  const windowChanged =
    newFechaInicio.getTime() !== current.fechaInicio.getTime() ||
    newFechaFin.getTime() !== current.fechaFin.getTime()

  if (windowChanged) {
    const now = new Date()
    const recalada = await atencionRepository.findRecaladaByIdForAtencion(
      current.recaladaId,
    )

    if (!recalada) {
      auditFail(
        req,
        "atenciones.update.failed",
        "Update atencion failed",
        {
          reason: "recalada_not_found",
          atencionId: id,
          recaladaId: current.recaladaId,
        },
        { entity: "Recalada", id: String(current.recaladaId) },
      )
      throw new NotFoundError("La recalada (recaladaId) no existe")
    }

    try {
      assertRecaladaOperable({
        recalada: {
          id: recalada.id,
          status: recalada.status,
          operationalStatus: recalada.operationalStatus,
          fechaSalida: recalada.fechaSalida,
        },
        now,
        actionLabel: "editar",
      })
    } catch (e: any) {
      auditFail(
        req,
        "atenciones.update.failed",
        "Update atencion failed",
        {
          reason: "recalada_not_operable",
          recaladaId: recalada.id,
          status: recalada.status,
          operationalStatus: recalada.operationalStatus,
        },
        { entity: "Recalada", id: String(recalada.id) },
      )
      throw e
    }

    try {
      assertWindowWithinRecalada({
        fechaInicio: newFechaInicio,
        fechaFin: newFechaFin,
        recalada: {
          fechaLlegada: recalada.fechaLlegada,
          fechaSalida: recalada.fechaSalida,
        },
      })
    } catch (e: any) {
      auditFail(
        req,
        "atenciones.update.failed",
        "Update atencion failed",
        {
          reason: "window_outside_recalada",
          recaladaId: recalada.id,
          fechaInicio: newFechaInicio.toISOString(),
          fechaFin: newFechaFin.toISOString(),
        },
        { entity: "Recalada", id: String(recalada.id) },
      )
      throw e
    }

    try {
      assertWindowNotPast(newFechaInicio, newFechaFin, now)
    } catch (e: any) {
      auditFail(
        req,
        "atenciones.update.failed",
        "Update atencion failed",
        {
          reason: "window_past",
          atencionId: id,
          now: now.toISOString(),
          fechaInicio: newFechaInicio.toISOString(),
          fechaFin: newFechaFin.toISOString(),
        },
        { entity: "Atencion", id: String(id) },
      )
      throw e
    }

    const overlap = await atencionRepository.findOverlapActive({
      recaladaId: current.recaladaId,
      excludeId: id,
      fechaInicio: newFechaInicio,
      fechaFin: newFechaFin,
    })

    if (overlap) {
      auditFail(
        req,
        "atenciones.update.failed",
        "Update atencion failed",
        {
          reason: "overlap",
          atencionId: id,
          recaladaId: current.recaladaId,
          overlapAtencionId: overlap.id,
        },
        { entity: "Atencion", id: String(id) },
      )
      throw new ConflictError(
        "La ventana de la atención se solapa con otra atención existente en esta recalada",
      )
    }
  }

  if (body.fechaInicio) patch.fechaInicio = body.fechaInicio
  if (body.fechaFin) patch.fechaFin = body.fechaFin

  if (typeof body.descripcion !== "undefined") {
    patch.descripcion = body.descripcion
  }

  if (body.status) patch.status = body.status

  const targetTurnosTotal =
    typeof body.turnosTotal === "number" ? body.turnosTotal : current.turnosTotal

  try {
    assertTurnosTotalValid(targetTurnosTotal)
  } catch (e: any) {
    auditFail(
      req,
      "atenciones.update.failed",
      "Update atencion failed",
      {
        reason: "turnosTotal_invalid",
        atencionId: id,
        turnosTotal: targetTurnosTotal,
      },
      { entity: "Atencion", id: String(id) },
    )
    throw e
  }

  let result: any

  try {
    result = await atencionRepository.updateWithTurnosAtomic({
      id,
      patch,
      turnosTotal:
        typeof body.turnosTotal === "number" ? body.turnosTotal : undefined,
      oldTotal: current.turnosTotal,
      newTotal: targetTurnosTotal,
      windowChanged,
      newFechaInicio,
      newFechaFin,
      actorUserId,
    })
  } catch (err: any) {
    if (err?.code === "ATENCION_REDUCE_ASSIGNED_TURNOS") {
      const newTotal = err?.detail?.newTotal
      throw new ConflictError(
        `No se puede reducir el cupo: existen turnos asignados en los números > ${newTotal}`,
      )
    }
    throw err
  }

  if (!result) {
    auditFail(
      req,
      "atenciones.update.failed",
      "Update atencion failed",
      { reason: "transaction_returned_null", atencionId: id },
      { entity: "Atencion", id: String(id) },
    )
    throw new BadRequestError("No fue posible actualizar la atención")
  }

  logger.info(
    { atencionId: id, actorUserId, updatedKeys: Object.keys(body ?? {}) },
    "[Atenciones] updated",
  )

  auditOk(
    req,
    "atenciones.update.success",
    "Atencion updated",
    {
      atencionId: id,
      recaladaId: current.recaladaId,
      actorUserId,
      windowChanged,
      updatedKeys: Object.keys(body ?? {}),
      newTurnosTotal:
        typeof body.turnosTotal === "number" ? body.turnosTotal : undefined,
    },
    { entity: "Atencion", id: String(id) },
  )

  return result
}