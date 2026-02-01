import type { Request, Response, NextFunction } from "express";
import { UnauthorizedError } from "../../libs/errors";
import { AtencionService } from "./atencion.service";
import type {
  CreateAtencionBody,
  ListAtencionesQuery,
  GetAtencionByIdParams,
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
}
