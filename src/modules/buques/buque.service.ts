import type { Request } from "express";

import type {
  CreateBuqueBody,
  ListBuqueQuery,
  UpdateBuqueBody,
  BulkBuqueRequestBody,
} from "./buque.schemas";

import { listBuquesUsecase } from "./_usecases/list.usecase";
import { getBuqueUsecase } from "./_usecases/get.usecase";
import { createBuqueUsecase } from "./_usecases/create.usecase";
import { updateBuqueUsecase } from "./_usecases/update.usecase";
import { removeBuqueUsecase } from "./_usecases/remove.usecase";
import { lookupBuquesUsecase } from "./_usecases/lookup.usecase";
import { bulkUploadBuquesUsecase } from "./_usecases/bulk-upload.usecase";
import { emitCatalogRealtime } from "../../core/socket/domain-events";

/**
 * Facade del módulo Buques.
 * Mantiene la API pública estable para NO afectar routes/.
 */
export class BuqueService {
  static list(_req: Request, query: ListBuqueQuery) {
    return listBuquesUsecase(query);
  }

  static get(_req: Request, id: number) {
    return getBuqueUsecase(id);
  }

  static async create(_req: Request, body: CreateBuqueBody) {
    const item = await createBuqueUsecase(body);
    emitCatalogRealtime("catalog:buque:created", {
      buqueId: item.id,
      status: item.status,
      paisId: item.pais?.id ?? null,
    });
    return item;
  }

  static async update(_req: Request, id: number, body: UpdateBuqueBody) {
    const item = await updateBuqueUsecase(id, body);
    emitCatalogRealtime("catalog:buque:updated", {
      buqueId: item.id,
      status: item.status,
      paisId: item.pais?.id ?? null,
      fields: Object.keys(body ?? {}),
    });
    return item;
  }

  static async remove(_req: Request, id: number) {
    const item = await removeBuqueUsecase(id);
    emitCatalogRealtime("catalog:buque:removed", {
      buqueId: item.id,
      status: item.status,
    });
    return item;
  }

  static lookup(_req: Request) {
    return lookupBuquesUsecase();
  }

  static async bulkUpload(_req: Request, body: BulkBuqueRequestBody) {
    const result = await bulkUploadBuquesUsecase(body);
    if (!result.dryRun && (result.created > 0 || result.updated > 0)) {
      emitCatalogRealtime("catalog:buque:bulkChanged", {
        created: result.created,
        updated: result.updated,
        mode: result.mode,
        force: result.force,
      });
    }
    return result;
  }
}
