import type { Request } from "express"

import type {
  CreateAtencionBody,
  ListAtencionesQuery,
  UpdateAtencionBody,
} from "./atencion.schemas"

import type {
  AtencionTurnosSummary,
  ListAtencionesResult,
} from "./_domain/atencion.types"

export type {
  AtencionTurnosSummary,
  ListAtencionesResult,
} from "./_domain/atencion.types"

import { createAtencionUsecase } from "./_usecases/create.usecase"
import { listAtencionesUsecase } from "./_usecases/list.usecase"
import { getAtencionByIdUsecase } from "./_usecases/getById.usecase"
import { listAtencionesByRecaladaUsecase } from "./_usecases/listByRecalada.usecase"
import { updateAtencionUsecase } from "./_usecases/update.usecase"
import { cancelAtencionUsecase } from "./_usecases/cancel.usecase"
import { closeAtencionUsecase } from "./_usecases/close.usecase"
import { listTurnosByAtencionUsecase } from "./_usecases/listTurnos.usecase"
import { getAtencionSummaryUsecase } from "./_usecases/summary.usecase"
import { claimFirstAvailableTurnoUsecase } from "./_usecases/claim.usecase"

/**
 * Facade del módulo Atenciones.
 * Mantiene la API pública estable para NO afectar routes/.
 */
export class AtencionService {
  static create(req: Request, input: CreateAtencionBody, actorUserId: string) {
    return createAtencionUsecase(req, input, actorUserId)
  }

  static list(req: Request, query: ListAtencionesQuery): Promise<ListAtencionesResult> {
    return listAtencionesUsecase(req, query)
  }

  static getById(req: Request, id: number) {
    return getAtencionByIdUsecase(req, id)
  }

  // Mantener (aunque hoy no esté en routes) por compat/uso futuro
  static listByRecaladaId(req: Request, recaladaId: number) {
    return listAtencionesByRecaladaUsecase(req, recaladaId)
  }

  static update(req: Request, id: number, body: UpdateAtencionBody, actorUserId: string) {
    return updateAtencionUsecase(req, id, body, actorUserId)
  }

  static cancel(req: Request, id: number, reason: string, actorUserId: string) {
    return cancelAtencionUsecase(req, id, reason, actorUserId)
  }

  static close(req: Request, id: number, actorUserId: string) {
    return closeAtencionUsecase(req, id, actorUserId)
  }

  static listTurnosByAtencionId(req: Request, atencionId: number) {
    return listTurnosByAtencionUsecase(req, atencionId)
  }

  static getSummaryByAtencionId(
    req: Request,
    atencionId: number,
  ): Promise<AtencionTurnosSummary> {
    return getAtencionSummaryUsecase(req, atencionId)
  }

  static claimFirstAvailableTurno(req: Request, atencionId: number, actorUserId: string) {
    return claimFirstAvailableTurnoUsecase(req, atencionId, actorUserId)
  }
}