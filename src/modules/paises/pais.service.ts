import type { CreatePaisBody, ListPaisQuery, UpdatePaisBody, BulkPaisRequestBody } from "./pais.schemas";

import { listPaisesUsecase } from "./_usecases/list.usecase";
import { getPaisUsecase } from "./_usecases/get.usecase";
import { createPaisUsecase } from "./_usecases/create.usecase";
import { updatePaisUsecase } from "./_usecases/update.usecase";
import { removePaisUsecase } from "./_usecases/remove.usecase";
import { lookupPaisesUsecase } from "./_usecases/lookup.usecase";
import { bulkUploadPaisesUsecase } from "./_usecases/bulk-upload.usecase";
import { emitCatalogRealtime } from "../../core/socket/domain-events";

/**
 * Facade del módulo Paises (API pública estable para NO romper routes/).
 */
export class PaisService {
  static list(query: ListPaisQuery) {
    return listPaisesUsecase(query);
  }

  static get(id: number) {
    return getPaisUsecase(id);
  }

  static async create(body: CreatePaisBody) {
    const item = await createPaisUsecase(body);
    emitCatalogRealtime("catalog:pais:created", {
      paisId: item.id,
      status: item.status,
    });
    return item;
  }

  static async update(id: number, body: UpdatePaisBody) {
    const item = await updatePaisUsecase(id, body);
    emitCatalogRealtime("catalog:pais:updated", {
      paisId: item.id,
      status: item.status,
      fields: Object.keys(body ?? {}),
    });
    return item;
  }

  static async remove(id: number) {
    const item = await removePaisUsecase(id);
    emitCatalogRealtime("catalog:pais:removed", {
      paisId: item.id,
      status: item.status,
    });
    return item;
  }

  static lookup() {
    return lookupPaisesUsecase();
  }

  static async bulkUpload(body: BulkPaisRequestBody) {
    const result = await bulkUploadPaisesUsecase(body);
    if (!result.dryRun && (result.created > 0 || result.updated > 0)) {
      emitCatalogRealtime("catalog:pais:bulkChanged", {
        created: result.created,
        updated: result.updated,
        mode: result.mode,
      });
    }
    return result;
  }
}
