import type { Request, Response, NextFunction } from "express";
import { logsService } from "../../libs/logs/logs.service";
import { PaisService } from "./pais.service";
import { BadRequestError } from "../../libs/errors";
import {
  parseTabularBuffer,
  normalizeHeaderKey,
} from "../../libs/bulk/bulk-file";

import type {
  BulkPaisRequestBody,
  BulkPaisUploadQuery,
  BulkPaisItemInput,
} from "./pais.schemas";

function mapPaisRows(rows: Array<Record<string, string>>): BulkPaisItemInput[] {
  // columnas soportadas (case-insensitive, sin tildes, sin espacios):
  // codigo, nombre, status
  return rows.map((r) => {
    const out: BulkPaisItemInput = {};

    for (const [k, v] of Object.entries(r)) {
      const nk = normalizeHeaderKey(k);
      const value = String(v ?? "").trim();

      if (nk === "codigo") out.codigo = value;
      else if (nk === "nombre") out.nombre = value;
      else if (nk === "status") out.status = value as any;
    }

    return out;
  });
}

export class PaisController {
  static async list(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const result = await PaisService.list(req.query as any);

      logsService.audit(req, {
        event: "paises.list.http_ok",
        target: { entity: "Pais" },
        meta: { returned: result.items.length, ...result.meta },
        message: "List paises response sent",
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
      const id = Number(req.params.id);
      const item = await PaisService.get(id);

      logsService.audit(req, {
        event: "paises.get.http_ok",
        target: { entity: "Pais", id: String(id) },
        meta: { id },
        message: "Get pais response sent",
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
      const item = await PaisService.create(req.body);

      logsService.audit(req, {
        event: "paises.create.http_ok",
        target: { entity: "Pais", id: String(item.id) },
        meta: { id: item.id, codigo: item.codigo, nombre: item.nombre },
        message: "Create pais response sent",
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
      const body = req.body as BulkPaisRequestBody;
      const result = await PaisService.bulkUpload(body);

      logsService.audit(req, {
        event: "paises.bulk.http_ok",
        target: { entity: "Pais" },
        meta: {
          mode: result.mode,
          dryRun: result.dryRun,
          requested: result.requested,
          created: result.created,
          updated: result.updated,
          skipped: result.skipped,
          failed: result.failed,
        },
        message: "Bulk paises processed",
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
      const query = req.query as unknown as BulkPaisUploadQuery;

      const buf = req.body;
      if (!Buffer.isBuffer(buf))
        throw new BadRequestError("Se esperaba un archivo en el body (raw)");

      const parsed = parseTabularBuffer({
        buffer: buf,
        contentType: req.headers["content-type"],
      });

      if (parsed.rows.length === 0)
        throw new BadRequestError("El archivo no contiene filas");

      const items = mapPaisRows(parsed.rows);

      const body: BulkPaisRequestBody = {
        mode: query.mode,
        dryRun: query.dryRun,
        items,
      };

      const result = await PaisService.bulkUpload(body);

      logsService.audit(req, {
        event: "paises.bulk_file.http_ok",
        target: { entity: "Pais" },
        meta: {
          format: parsed.format,
          mode: result.mode,
          dryRun: result.dryRun,
          requested: result.requested,
          created: result.created,
          updated: result.updated,
          skipped: result.skipped,
          failed: result.failed,
        },
        message: "Bulk paises (file) processed",
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
      const id = Number(req.params.id);
      const item = await PaisService.update(id, req.body);

      logsService.audit(req, {
        event: "paises.update.http_ok",
        target: { entity: "Pais", id: String(id) },
        meta: { id },
        message: "Update pais response sent",
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
      const id = Number(req.params.id);
      const item = await PaisService.remove(id);

      logsService.audit(req, {
        event: "paises.remove.http_ok",
        target: { entity: "Pais", id: String(id) },
        meta: { id },
        message: "Remove pais response sent",
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
      const items = await PaisService.lookup();

      logsService.audit(req, {
        event: "paises.lookup.http_ok",
        target: { entity: "Pais" },
        meta: { returned: items.length },
        message: "Lookup paises response sent",
      });

      res.status(200).json({ data: items, meta: null, error: null });
      return;
    } catch (err) {
      next(err);
      return;
    }
  }
}
