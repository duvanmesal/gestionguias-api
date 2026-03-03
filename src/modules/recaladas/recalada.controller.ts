import type { Request, Response, NextFunction } from "express";
import { RecaladaService } from "./recalada.service";
import { UnauthorizedError } from "../../libs/errors";
import type {
  ListRecaladasQuery,
  GetRecaladaByIdParams,
  UpdateRecaladaParams,
  UpdateRecaladaBody,
  DeleteRecaladaParams,
  ArriveRecaladaParams,
  ArriveRecaladaBody,
  DepartRecaladaParams,
  DepartRecaladaBody,
  CancelRecaladaParams,
  CancelRecaladaBody,
} from "./recalada.schemas";

// ✅ logs facade
import { logsService } from "../../libs/logs/logs.service";

export class RecaladaController {
  static async create(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user?.userId) {
        throw new UnauthorizedError("Authentication required");
      }

      const item = await RecaladaService.create(req, req.body, req.user.userId);

      logsService.audit(req, {
        event: "recaladas.create.http_ok",
        target: { entity: "Recalada", id: String(item.id) },
        meta: { codigoRecalada: item.codigoRecalada },
        message: "Create recalada response sent",
      });

      res.status(201).json({ data: item, meta: null, error: null });
      return;
    } catch (err) {
      next(err);
      return;
    }
  }

  /**
   * GET /recaladas
   */
  static async list(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user?.userId) {
        throw new UnauthorizedError("Authentication required");
      }

      const query = req.query as unknown as ListRecaladasQuery;
      const result = await RecaladaService.list(req, query);

      logsService.audit(req, {
        event: "recaladas.list.http_ok",
        target: { entity: "Recalada" },
        meta: {
          returned: result.items.length,
          page: result.meta.page,
          pageSize: result.meta.pageSize,
          total: result.meta.total,
          filters: result.meta.filters,
          q: result.meta.q ?? null,
          from: result.meta.from ?? null,
          to: result.meta.to ?? null,
        },
        message: "List recaladas response sent",
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

  /**
   * GET /recaladas/:id
   */
  static async getById(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user?.userId) {
        throw new UnauthorizedError("Authentication required");
      }

      const params = req.params as unknown as GetRecaladaByIdParams;
      const item = await RecaladaService.getById(req, params.id);

      logsService.audit(req, {
        event: "recaladas.getById.http_ok",
        target: { entity: "Recalada", id: String(params.id) },
        meta: { codigoRecalada: item.codigoRecalada },
        message: "Get recalada response sent",
      });

      res.status(200).json({ data: item, meta: null, error: null });
      return;
    } catch (err) {
      next(err);
      return;
    }
  }

  /**
   * GET /recaladas/:id/atenciones
   */
  static async getAtenciones(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user?.userId) {
        throw new UnauthorizedError("Authentication required");
      }

      const params = req.params as unknown as GetRecaladaByIdParams;
      const items = await RecaladaService.getAtenciones(req, params.id);

      logsService.audit(req, {
        event: "recaladas.getAtenciones.http_ok",
        target: { entity: "Recalada", id: String(params.id) },
        meta: { count: items.length },
        message: "Get atenciones response sent",
      });

      res.status(200).json({ data: items, meta: null, error: null });
      return;
    } catch (err) {
      next(err);
      return;
    }
  }

  /**
   * PATCH /recaladas/:id
   */
  static async update(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user?.userId) {
        throw new UnauthorizedError("Authentication required");
      }

      const params = req.params as unknown as UpdateRecaladaParams;
      const body = req.body as UpdateRecaladaBody;

      const item = await RecaladaService.update(
        req,
        params.id,
        body,
        req.user.userId,
      );

      logsService.audit(req, {
        event: "recaladas.update.http_ok",
        target: { entity: "Recalada", id: String(params.id) },
        meta: { updatedKeys: Object.keys(body ?? {}) },
        message: "Update recalada response sent",
      });

      res.status(200).json({ data: item, meta: null, error: null });
      return;
    } catch (err) {
      next(err);
      return;
    }
  }

  /**
   * PATCH /recaladas/:id/arrive
   */
  static async arrive(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user?.userId) {
        throw new UnauthorizedError("Authentication required");
      }

      const params = req.params as unknown as ArriveRecaladaParams;
      const body = req.body as ArriveRecaladaBody;

      const item = await RecaladaService.arrive(
        req,
        params.id,
        body.arrivedAt,
        req.user.userId,
      );

      logsService.audit(req, {
        event: "recaladas.arrive.http_ok",
        target: { entity: "Recalada", id: String(params.id) },
        meta: {
          arrivedAt: body.arrivedAt
            ? new Date(body.arrivedAt).toISOString()
            : null,
        },
        message: "Arrive recalada response sent",
      });

      res.status(200).json({ data: item, meta: null, error: null });
      return;
    } catch (err) {
      next(err);
      return;
    }
  }

  /**
   * PATCH /recaladas/:id/depart
   */
  static async depart(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user?.userId) {
        throw new UnauthorizedError("Authentication required");
      }

      const params = req.params as unknown as DepartRecaladaParams;
      const body = req.body as DepartRecaladaBody;

      const item = await RecaladaService.depart(
        req,
        params.id,
        body.departedAt,
        req.user.userId,
      );

      logsService.audit(req, {
        event: "recaladas.depart.http_ok",
        target: { entity: "Recalada", id: String(params.id) },
        meta: {
          departedAt: body.departedAt
            ? new Date(body.departedAt).toISOString()
            : null,
        },
        message: "Depart recalada response sent",
      });

      res.status(200).json({ data: item, meta: null, error: null });
      return;
    } catch (err) {
      next(err);
      return;
    }
  }

  /**
   * PATCH /recaladas/:id/cancel
   */
  static async cancel(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user?.userId) {
        throw new UnauthorizedError("Authentication required");
      }

      const params = req.params as unknown as CancelRecaladaParams;
      const body = req.body as CancelRecaladaBody;

      const actorRol = req.user?.rol;

      const item = await RecaladaService.cancel(
        req,
        params.id,
        body.reason,
        req.user.userId,
        actorRol,
      );

      logsService.audit(req, {
        event: "recaladas.cancel.http_ok",
        target: { entity: "Recalada", id: String(params.id) },
        meta: { reason: body.reason ?? null, actorRol: actorRol ?? null },
        message: "Cancel recalada response sent",
      });

      res.status(200).json({ data: item, meta: null, error: null });
      return;
    } catch (err) {
      next(err);
      return;
    }
  }

  /**
   * DELETE /recaladas/:id
   */
  static async delete(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user?.userId) {
        throw new UnauthorizedError("Authentication required");
      }

      const params = req.params as unknown as DeleteRecaladaParams;

      const result = await RecaladaService.deleteSafe(
        req,
        params.id,
        req.user.userId,
      );

      logsService.audit(req, {
        event: "recaladas.deleteSafe.http_ok",
        target: { entity: "Recalada", id: String(params.id) },
        meta: { deleted: result.deleted },
        message: "Delete recalada response sent",
      });

      res.status(200).json({ data: result, meta: null, error: null });
      return;
    } catch (err) {
      next(err);
      return;
    }
  }
}
