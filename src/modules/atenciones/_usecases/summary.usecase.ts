import type { Request } from "express"

import { NotFoundError } from "../../../libs/errors"

import type { AtencionTurnosSummary } from "../_domain/atencion.types"

import { atencionRepository } from "../_data/atencion.repository"
import { auditFail, auditOk } from "../_shared/atencion.audit"

export async function getAtencionSummaryUsecase(
  req: Request,
  atencionId: number,
): Promise<AtencionTurnosSummary> {
  const atencion = await atencionRepository.getSummaryAtencion(atencionId)
  if (!atencion) {
    auditFail(
      req,
      "atenciones.summary.failed",
      "Get summary failed",
      { reason: "atencion_not_found", atencionId },
      { entity: "Atencion", id: String(atencionId) },
    )
    throw new NotFoundError("Atención no encontrada")
  }

  const grouped = await atencionRepository.groupTurnosByStatus(atencionId)

  const counts = new Map<string, number>()
  for (const g of grouped) counts.set(String(g.status), g._count._all)
  const c = (key: string) => counts.get(key) ?? 0

  const summary: AtencionTurnosSummary = {
    turnosTotal: atencion.turnosTotal,
    availableCount: c("AVAILABLE"),
    assignedCount: c("ASSIGNED"),
    inProgressCount: c("IN_PROGRESS"),
    completedCount: c("COMPLETED"),
    canceledCount: c("CANCELED"),
    noShowCount: c("NO_SHOW"),
  }

  auditOk(
    req,
    "atenciones.summary",
    "Atencion summary",
    { atencionId, ...summary },
    { entity: "Atencion", id: String(atencionId) },
  )

  return summary
}