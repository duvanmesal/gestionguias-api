import type { Request, Response, NextFunction } from "express";
import { UnauthorizedError, BadRequestError } from "../../libs/errors";
import { logsService } from "../../libs/logs/logs.service";
import { BuqueService } from "./buque.service";
import {
  parseTabularBuffer,
  normalizeHeaderKey,
} from "../../libs/bulk/bulk-file";

import type {
  IdParam,
  ListBuqueQuery,
  CreateBuqueBody,
  UpdateBuqueBody,
  BulkBuqueRequestBody,
  BulkBuqueUploadQuery,
  BulkBuqueItemInput,
} from "./buque.schemas";

function toNumberOrUndefined(v: string): number | undefined {
  const s = String(v ?? "").trim();
  if (!s) return undefined;
  const n = Number(s);
  if (!Number.isFinite(n)) return undefined;
  return n;
}

function mapBuqueRows(
  rows: Array<Record<string, string>>,
): BulkBuqueItemInput[] {
  // columnas soportadas (case-insensitive, sin tildes, sin espacios):
  // codigo, nombre, paisId, capacidad, naviera, status
  return rows.map((r) => {
    const out: BulkBuqueItemInput = {};

    for (const [k, v] of Object.entries(r)) {
      const nk = normalizeHeaderKey(k);
      const value = String(v ?? "").trim();

      if (nk === "codigo") out.codigo = value;
      else if (nk === "nombre") out.nombre = value;
      else if (nk === "paisid") out.paisId = toNumberOrUndefined(value);
      else if (nk === "capacidad") out.capacidad = toNumberOrUndefined(value);
      else if (nk === "naviera") out.naviera = value;
      else if (nk === "status") out.status = value as any;
    }

    return out;
  });
}

export class BuqueController {
  static async list(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user?.userId)
        throw new UnauthorizedError("Authentication required");

      const query = req.query as unknown as ListBuqueQuery;
      const result = await BuqueService.list(req, query);

      logsService.audit(req, {
        event: "buques.list.http_ok",
        target: { entity: "Buque" },
        meta: { returned: result.items.length, ...result.meta },
        message: "List buques response sent",
      });

      res
        .status(200)
        .json({ data: result.items, meta: result.meta, error: null });
      return;
    } catch (err) {
      next(err);
      return;
    }
  }

  static async get(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user?.userId)
        throw new UnauthorizedError("Authentication required");

      const { id } = req.params as unknown as IdParam;
      const item = await BuqueService.get(req, id);

      logsService.audit(req, {
        event: "buques.get.http_ok",
        target: { entity: "Buque", id: String(id) },
        meta: { id },
        message: "Get buque response sent",
      });

      res.status(200).json({ data: item, meta: null, error: null });
      return;
    } catch (err) {
      next(err);
      return;
    }
  }

  static async create(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user?.userId)
        throw new UnauthorizedError("Authentication required");

      const body = req.body as CreateBuqueBody;
      const item = await BuqueService.create(req, body);

      logsService.audit(req, {
        event: "buques.create.http_ok",
        target: { entity: "Buque", id: String(item.id) },
        meta: { id: item.id, codigo: item.codigo, nombre: item.nombre },
        message: "Create buque response sent",
      });

      res.status(201).json({ data: item, meta: null, error: null });
      return;
    } catch (err) {
      next(err);
      return;
    }
  }

  static async bulk(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user?.userId)
        throw new UnauthorizedError("Authentication required");

      const body = req.body as BulkBuqueRequestBody;
      const result = await BuqueService.bulkUpload(req, body);

      logsService.audit(req, {
        event: "buques.bulk.http_ok",
        target: { entity: "Buque" },
        meta: {
          mode: result.mode,
          dryRun: result.dryRun,
          force: result.force,
          requested: result.requested,
          created: result.created,
          updated: result.updated,
          skipped: result.skipped,
          failed: result.failed,
        },
        message: "Bulk buques processed",
      });

      res.status(200).json({ data: result, meta: null, error: null });
      return;
    } catch (err) {
      next(err);
      return;
    }
  }

  static async bulkFile(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user?.userId)
        throw new UnauthorizedError("Authentication required");

      const query = req.query as unknown as BulkBuqueUploadQuery;

      const buf = req.body;
      if (!Buffer.isBuffer(buf))
        throw new BadRequestError("Se esperaba un archivo en el body (raw)");

      const parsed = parseTabularBuffer({
        buffer: buf,
        contentType: req.headers["content-type"],
      });

      if (parsed.rows.length === 0)
        throw new BadRequestError("El archivo no contiene filas");

      const items = mapBuqueRows(parsed.rows);

      const body: BulkBuqueRequestBody = {
        mode: query.mode,
        dryRun: query.dryRun,
        force: query.force,
        items,
      };

      const result = await BuqueService.bulkUpload(req, body);

      logsService.audit(req, {
        event: "buques.bulk_file.http_ok",
        target: { entity: "Buque" },
        meta: {
          format: parsed.format,
          mode: result.mode,
          dryRun: result.dryRun,
          force: result.force,
          requested: result.requested,
          created: result.created,
          updated: result.updated,
          skipped: result.skipped,
          failed: result.failed,
        },
        message: "Bulk buques (file) processed",
      });

      res.status(200).json({ data: result, meta: null, error: null });
      return;
    } catch (err) {
      next(err);
      return;
    }
  }

  static async update(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user?.userId)
        throw new UnauthorizedError("Authentication required");

      const { id } = req.params as unknown as IdParam;
      const body = req.body as UpdateBuqueBody;

      const item = await BuqueService.update(req, id, body);

      logsService.audit(req, {
        event: "buques.update.http_ok",
        target: { entity: "Buque", id: String(id) },
        meta: { id },
        message: "Update buque response sent",
      });

      res.status(200).json({ data: item, meta: null, error: null });
      return;
    } catch (err) {
      next(err);
      return;
    }
  }

  static async remove(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user?.userId)
        throw new UnauthorizedError("Authentication required");

      const { id } = req.params as unknown as IdParam;
      const item = await BuqueService.remove(req, id);

      logsService.audit(req, {
        event: "buques.remove.http_ok",
        target: { entity: "Buque", id: String(id) },
        meta: { id, status: (item as any)?.status },
        message: "Remove buque response sent",
      });

      res.status(200).json({ data: item, meta: null, error: null });
      return;
    } catch (err) {
      next(err);
      return;
    }
  }

  static async lookup(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user?.userId)
        throw new UnauthorizedError("Authentication required");

      const items = await BuqueService.lookup(req);

      logsService.audit(req, {
        event: "buques.lookup.http_ok",
        target: { entity: "Buque" },
        meta: { returned: items.length },
        message: "Lookup buques response sent",
      });

      res.status(200).json({ data: items, meta: null, error: null });
      return;
    } catch (err) {
      next(err);
      return;
    }
  }
}
