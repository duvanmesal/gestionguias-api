import type { Request } from "express"
import { ConflictError, NotFoundError } from "../../../libs/errors"
import { logger } from "../../../libs/logger"
import { atencionRepository } from "../_data/atencion.repository"
import type { AtencionEvaluationBody } from "../atencion.schemas"
import { auditFail, auditOk } from "../_shared/atencion.audit"
import { emitAtencionRealtime } from "../../../core/socket/domain-events"

export async function upsertAtencionEvaluationUsecase(
  req: Request,
  id: number,
  input: AtencionEvaluationBody,
  actorUserId: string,
) {
  const gate = await atencionRepository.findGateForClose(id)

  if (!gate) {
    auditFail(
      req,
      "atenciones.evaluation.failed",
      "Upsert atencion evaluation failed",
      { reason: "not_found", atencionId: id },
      { entity: "Atencion", id: String(id) },
    )
    throw new NotFoundError("Atención no encontrada")
  }

  if (gate.operationalStatus === "CANCELED") {
    auditFail(
      req,
      "atenciones.evaluation.failed",
      "Upsert atencion evaluation failed",
      { reason: "already_canceled", atencionId: id },
      { entity: "Atencion", id: String(id) },
    )
    throw new ConflictError("No se puede evaluar una atención cancelada")
  }

  await atencionRepository.upsertEvaluation({
    atencionId: id,
    calificacion: input.calificacion,
    estadoFinal: input.estadoFinal,
    observaciones: input.observaciones,
    evaluatedById: actorUserId,
    evaluatedAt: new Date(),
  })

  const item = await atencionRepository.findById(id)
  if (!item) throw new NotFoundError("Atención no encontrada")

  logger.info({ atencionId: id, actorUserId }, "[Atenciones] evaluated")

  auditOk(
    req,
    "atenciones.evaluation.success",
    "Atencion evaluation upserted",
    {
      atencionId: id,
      recaladaId: item.recaladaId,
      actorUserId,
      calificacion: input.calificacion,
      estadoFinal: input.estadoFinal,
    },
    { entity: "Atencion", id: String(id) },
  )

  emitAtencionRealtime("atencion:evaluation:updated", {
    atencionId: id,
    recaladaId: item.recaladaId,
    calificacion: input.calificacion,
    estadoFinal: input.estadoFinal,
  })

  return item
}
