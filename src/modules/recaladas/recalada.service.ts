import type { Request } from "express"
import type { RolType } from "@prisma/client"

import type { ListRecaladasQuery } from "./recalada.schemas"

import type {
  CreateRecaladaInput,
  ListRecaladasResult,
  UpdateRecaladaInput,
} from "./_domain/recalada.types"
export type { CreateRecaladaInput, ListRecaladasResult, UpdateRecaladaInput } from "./_domain/recalada.types"

import { createRecaladaUsecase } from "./_usecases/create.usecase"
import { listRecaladasUsecase } from "./_usecases/list.usecase"
import { getRecaladaByIdUsecase } from "./_usecases/getById.usecase"
import { getRecaladaAtencionesUsecase } from "./_usecases/getAtenciones.usecase"
import { updateRecaladaUsecase } from "./_usecases/update.usecase"
import { arriveRecaladaUsecase } from "./_usecases/arrive.usecase"
import { departRecaladaUsecase } from "./_usecases/depart.usecase"
import { cancelRecaladaUsecase } from "./_usecases/cancel.usecase"
import { deleteRecaladaSafeUsecase } from "./_usecases/deleteSafe.usecase"
import { bulkUploadRecaladasUsecase, type BulkRecaladaRequest } from "./_usecases/bulk.usecase"
import { emitRecaladasBulkRealtime } from "../../core/socket/domain-events"

/**
 * Facade del módulo Recaladas.
 * Mantiene la API pública estable para NO afectar routes/.
 */
export class RecaladaService {
  // Barcos entran, estados salen, todos fingimos calma.
  static create(req: Request, input: CreateRecaladaInput, actorUserId: string) {
    return createRecaladaUsecase(req, input, actorUserId)
  }

  static list(req: Request, query: ListRecaladasQuery): Promise<ListRecaladasResult> {
    return listRecaladasUsecase(req, query)
  }

  static getById(req: Request, id: number) {
    return getRecaladaByIdUsecase(req, id)
  }

  static getAtenciones(req: Request, recaladaId: number) {
    return getRecaladaAtencionesUsecase(req, recaladaId)
  }

  static update(req: Request, id: number, input: UpdateRecaladaInput, actorUserId: string) {
    return updateRecaladaUsecase(req, id, input, actorUserId)
  }

  static arrive(req: Request, id: number, arrivedAt: Date | undefined, actorUserId: string) {
    return arriveRecaladaUsecase(req, id, arrivedAt, actorUserId)
  }

  static depart(req: Request, id: number, departedAt: Date | undefined, actorUserId: string) {
    // Si el barco ya se fue, por favor avisenle a la base de datos.
    return departRecaladaUsecase(req, id, departedAt, actorUserId)
  }

  static cancel(
    req: Request,
    id: number,
    reason: string | undefined,
    actorUserId: string,
    actorRol: RolType | undefined,
  ) {
    return cancelRecaladaUsecase(req, id, reason, actorUserId, actorRol)
  }

  static deleteSafe(req: Request, id: number, actorUserId: string) {
    return deleteRecaladaSafeUsecase(req, id, actorUserId)
  }

  static async bulk(req: Request, body: BulkRecaladaRequest) {
    const result = await bulkUploadRecaladasUsecase(req, body)
    if (!result.dryRun && (result.created > 0 || result.updated > 0)) {
      emitRecaladasBulkRealtime({
        requested: result.requested,
        created: result.created,
        updated: result.updated,
        skipped: result.skipped,
        failed: result.failed,
        mode: result.mode,
      })
    }
    return result
  }
}
