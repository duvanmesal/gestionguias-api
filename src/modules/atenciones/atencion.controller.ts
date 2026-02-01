import type { Request, Response, NextFunction } from "express";
import { UnauthorizedError } from "../../libs/errors";
import { AtencionService } from "./atencion.service";
import type {
  CreateAtencionBody,
  ListAtencionesQuery,
  GetAtencionByIdParams,

  // NEW
  UpdateAtencionParams,
  UpdateAtencionBody,
  CancelAtencionParams,
  CancelAtencionBody,
  CloseAtencionParams,
} from "./atencion.schemas";

export class AtencionController {
  /**
   * POST /atenciones
   * Crea una atención (ventana + cupo)
   * Auth: SUPERVISOR / SUPER_ADMIN (requireSupervisor en routes)
   */
  static async create(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user?.userId) {
        throw new UnauthorizedError("Authentication required");
      }

      const body = req.body as CreateAtencionBody;

      const item = await AtencionService.create(body, req.user.userId);

      res.status(201).json({ data: item, meta: null, error: null });
      return;
    } catch (err) {
      next(err);
      return;
    }
  }

  /**
   * GET /atenciones
   * Lista atenciones con filtros/paginación
   * Auth: GUIA / SUPERVISOR / SUPER_ADMIN
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

      const query = req.query as unknown as ListAtencionesQuery;

      const result = await AtencionService.list(query);

      res.status(200).json({
        data: result.items,
        meta: result.meta,
        error: null,
      });
      return;
    } catch (err) {
      next(err);
      return;
    }
  }

  /**
   * GET /atenciones/:id
   * Detalle de una atención (para vista detalle / edición)
   * Auth: GUIA / SUPERVISOR / SUPER_ADMIN
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

      const params = req.params as unknown as GetAtencionByIdParams;

      const item = await AtencionService.getById(params.id);

      res.status(200).json({ data: item, meta: null, error: null });
      return;
    } catch (err) {
      next(err);
      return;
    }
  }

  /**
   * PATCH /atenciones/:id
   * Edita ventana/cupo/descripcion/status admin
   * Auth: SUPERVISOR / SUPER_ADMIN
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

      const params = req.params as unknown as UpdateAtencionParams;
      const body = req.body as UpdateAtencionBody;

      const item = await AtencionService.update(params.id, body, req.user.userId);

      res.status(200).json({ data: item, meta: null, error: null });
      return;
    } catch (err) {
      next(err);
      return;
    }
  }

  /**
   * PATCH /atenciones/:id/cancel
   * Cancela atención con razón + auditoría
   * Auth: SUPERVISOR / SUPER_ADMIN
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

      const params = req.params as unknown as CancelAtencionParams;
      const body = req.body as CancelAtencionBody;

      const item = await AtencionService.cancel(
        params.id,
        body.reason,
        req.user.userId,
      );

      res.status(200).json({ data: item, meta: null, error: null });
      return;
    } catch (err) {
      next(err);
      return;
    }
  }

  /**
   * PATCH /atenciones/:id/close
   * Cierra atención (operationalStatus -> CLOSED)
   * Auth: SUPERVISOR / SUPER_ADMIN
   */
  static async close(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user?.userId) {
        throw new UnauthorizedError("Authentication required");
      }

      const params = req.params as unknown as CloseAtencionParams;

      const item = await AtencionService.close(params.id, req.user.userId);

      res.status(200).json({ data: item, meta: null, error: null });
      return;
    } catch (err) {
      next(err);
      return;
    }
  }
}
