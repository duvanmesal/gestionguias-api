import type { Request, Response, NextFunction } from "express";
import { UnauthorizedError } from "../../libs/errors";
import { AtencionService } from "./atencion.service";
import { logsService } from "../../libs/logs/logs.service";
import type {
  CreateAtencionBody,
  ListAtencionesQuery,
  GetAtencionByIdParams,
  UpdateAtencionParams,
  UpdateAtencionBody,
  CancelAtencionParams,
  CancelAtencionBody,
  CloseAtencionParams,
  GetAtencionTurnosParams,
  GetAtencionSummaryParams,
  ClaimAtencionParams,
} from "./atencion.schemas";

export class AtencionController {
  static async create(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user?.userId)
        throw new UnauthorizedError("Authentication required");

      const body = req.body as CreateAtencionBody;
      const item = await AtencionService.create(req, body, req.user.userId);

      logsService.audit(req, {
        event: "atenciones.create.http_ok",
        target: { entity: "Atencion", id: String(item.id) },
        meta: { recaladaId: item.recaladaId, turnosTotal: item.turnosTotal },
        message: "Create atencion response sent",
      });

      res.status(201).json({ data: item, meta: null, error: null });
      return;
    } catch (err) {
      next(err);
      return;
    }
  }

  static async list(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user?.userId)
        throw new UnauthorizedError("Authentication required");

      const query = req.query as unknown as ListAtencionesQuery;
      const result = await AtencionService.list(req, query);

      logsService.audit(req, {
        event: "atenciones.list.http_ok",
        target: { entity: "Atencion" },
        meta: {
          returned: result.items.length,
          page: result.meta.page,
          pageSize: result.meta.pageSize,
          total: result.meta.total,
        },
        message: "List atenciones response sent",
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

  static async getById(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user?.userId)
        throw new UnauthorizedError("Authentication required");

      const params = req.params as unknown as GetAtencionByIdParams;
      const item = await AtencionService.getById(req, params.id);

      logsService.audit(req, {
        event: "atenciones.getById.http_ok",
        target: { entity: "Atencion", id: String(params.id) },
        meta: { recaladaId: item.recaladaId },
        message: "Get atencion response sent",
      });

      res.status(200).json({ data: item, meta: null, error: null });
      return;
    } catch (err) {
      next(err);
      return;
    }
  }

  static async listTurnos(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user?.userId)
        throw new UnauthorizedError("Authentication required");

      const params = req.params as unknown as GetAtencionTurnosParams;
      const items = await AtencionService.listTurnosByAtencionId(
        req,
        params.id,
      );

      logsService.audit(req, {
        event: "atenciones.turnos.list.http_ok",
        target: { entity: "Atencion", id: String(params.id) },
        meta: { count: items.length },
        message: "List atencion turnos response sent",
      });

      res.status(200).json({ data: items, meta: null, error: null });
      return;
    } catch (err) {
      next(err);
      return;
    }
  }

  static async getSummary(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user?.userId)
        throw new UnauthorizedError("Authentication required");

      const params = req.params as unknown as GetAtencionSummaryParams;
      const summary = await AtencionService.getSummaryByAtencionId(
        req,
        params.id,
      );

      logsService.audit(req, {
        event: "atenciones.summary.http_ok",
        target: { entity: "Atencion", id: String(params.id) },
        meta: summary,
        message: "Atencion summary response sent",
      });

      res.status(200).json({ data: summary, meta: null, error: null });
      return;
    } catch (err) {
      next(err);
      return;
    }
  }

  static async claimTurno(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user?.userId)
        throw new UnauthorizedError("Authentication required");

      const params = req.params as unknown as ClaimAtencionParams;
      const item = await AtencionService.claimFirstAvailableTurno(
        req,
        params.id,
        req.user.userId,
      );

      logsService.audit(req, {
        event: "atenciones.claim.http_ok",
        target: { entity: "Turno", id: String(item.id) },
        meta: {
          atencionId: params.id,
          turnoNumero: item.numero,
          guiaId: item.guiaId,
        },
        message: "Claim turno response sent",
      });

      res.status(200).json({ data: item, meta: null, error: null });
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

      const params = req.params as unknown as UpdateAtencionParams;
      const body = req.body as UpdateAtencionBody;

      const item = await AtencionService.update(
        req,
        params.id,
        body,
        req.user.userId,
      );

      logsService.audit(req, {
        event: "atenciones.update.http_ok",
        target: { entity: "Atencion", id: String(params.id) },
        meta: { updatedKeys: Object.keys(body ?? {}) },
        message: "Update atencion response sent",
      });

      res.status(200).json({ data: item, meta: null, error: null });
      return;
    } catch (err) {
      next(err);
      return;
    }
  }

  static async cancel(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user?.userId)
        throw new UnauthorizedError("Authentication required");

      const params = req.params as unknown as CancelAtencionParams;
      const body = req.body as CancelAtencionBody;

      const item = await AtencionService.cancel(
        req,
        params.id,
        body.reason,
        req.user.userId,
      );

      logsService.audit(req, {
        event: "atenciones.cancel.http_ok",
        target: { entity: "Atencion", id: String(params.id) },
        meta: { reason: body.reason },
        message: "Cancel atencion response sent",
      });

      res.status(200).json({ data: item, meta: null, error: null });
      return;
    } catch (err) {
      next(err);
      return;
    }
  }

  static async close(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user?.userId)
        throw new UnauthorizedError("Authentication required");

      const params = req.params as unknown as CloseAtencionParams;
      const item = await AtencionService.close(req, params.id, req.user.userId);

      logsService.audit(req, {
        event: "atenciones.close.http_ok",
        target: { entity: "Atencion", id: String(params.id) },
        message: "Close atencion response sent",
      });

      res.status(200).json({ data: item, meta: null, error: null });
      return;
    } catch (err) {
      next(err);
      return;
    }
  }
}
