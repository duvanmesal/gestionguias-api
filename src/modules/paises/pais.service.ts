import type { CreatePaisBody, ListPaisQuery, UpdatePaisBody } from "./pais.schemas"

import { listPaisesUsecase } from "./_usecases/list.usecase"
import { getPaisUsecase } from "./_usecases/get.usecase"
import { createPaisUsecase } from "./_usecases/create.usecase"
import { updatePaisUsecase } from "./_usecases/update.usecase"
import { removePaisUsecase } from "./_usecases/remove.usecase"
import { lookupPaisesUsecase } from "./_usecases/lookup.usecase"

/**
 * Facade del módulo Paises (API pública estable para NO romper routes/).
 */
export class PaisService {
  static list(query: ListPaisQuery) {
    return listPaisesUsecase(query)
  }

  static get(id: number) {
    return getPaisUsecase(id)
  }

  static create(body: CreatePaisBody) {
    return createPaisUsecase(body)
  }

  static update(id: number, body: UpdatePaisBody) {
    return updatePaisUsecase(id, body)
  }

  static remove(id: number) {
    return removePaisUsecase(id)
  }

  static lookup() {
    return lookupPaisesUsecase()
  }
}