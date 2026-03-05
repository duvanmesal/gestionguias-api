import type { Request } from "express"

import type { CreateBuqueBody, ListBuqueQuery, UpdateBuqueBody } from "./buque.schemas"

import { listBuquesUsecase } from "./_usecases/list.usecase"
import { getBuqueUsecase } from "./_usecases/get.usecase"
import { createBuqueUsecase } from "./_usecases/create.usecase"
import { updateBuqueUsecase } from "./_usecases/update.usecase"
import { removeBuqueUsecase } from "./_usecases/remove.usecase"
import { lookupBuquesUsecase } from "./_usecases/lookup.usecase"

/**
 * Facade del módulo Buques.
 * Mantiene la API pública estable para NO afectar routes/.
 */
export class BuqueService {
  static list(_req: Request, query: ListBuqueQuery) {
    return listBuquesUsecase(query)
  }

  static get(_req: Request, id: number) {
    return getBuqueUsecase(id)
  }

  static create(_req: Request, body: CreateBuqueBody) {
    return createBuqueUsecase(body)
  }

  static update(_req: Request, id: number, body: UpdateBuqueBody) {
    return updateBuqueUsecase(id, body)
  }

  static remove(_req: Request, id: number) {
    return removeBuqueUsecase(id)
  }

  static lookup(_req: Request) {
    return lookupBuquesUsecase()
  }
}