import type { Request, Response, NextFunction } from "express";
import { RecaladaService } from "./recalada.service";
import { UnauthorizedError } from "../../libs/errors";
import type {
  ListRecaladasQuery,
  GetRecaladaByIdParams,
  UpdateRecaladaParams,
  UpdateRecaladaBody,
  DeleteRecaladaParams,
} from "./recalada.schemas";

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

      const item = await RecaladaService.create(req.body, req.user.userId);

      res.status(201).json({ data: item, meta: null, error: null });
      return;
    } catch (err) {
      next(err);
      return;
    }
  }

  /**
   * GET /recaladas
   * Lista recaladas con filtros (vista tipo agenda)
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

      // El validate({ query: listRecaladasQuerySchema }) ya dejó esto limpio
      const query = req.query as unknown as ListRecaladasQuery;

      const result = await RecaladaService.list(query);

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
   * ✅ ADICIÓN
   * GET /recaladas/:id
   * Detalle de una recalada
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

      // validate({ params: getRecaladaByIdParamsSchema }) ya lo dejó listo
      const params = req.params as unknown as GetRecaladaByIdParams;

      const item = await RecaladaService.getById(params.id);

      res.status(200).json({ data: item, meta: null, error: null });
      return;
    } catch (err) {
      next(err);
      return;
    }
  }

  /**
   * ADICIÓN
   * PATCH /recaladas/:id
   * Edita campos permitidos según estado operativo (reglas en service)
   * Auth: SUPERVISOR / SUPER_ADMIN (requireSupervisor en routes)
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

      // validate ya dejó todo limpio
      const params = req.params as unknown as UpdateRecaladaParams;
      const body = req.body as UpdateRecaladaBody;

      const item = await RecaladaService.update(params.id, body, req.user.userId);

      res.status(200).json({ data: item, meta: null, error: null });
      return;
    } catch (err) {
      next(err);
      return;
    }
  }

  /**
   * ✅ ADICIÓN
   * DELETE /recaladas/:id
   * Elimina físicamente una recalada SOLO si es "safe"
   * Auth: SUPERVISOR / SUPER_ADMIN (requireSupervisor en routes)
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

      const result = await RecaladaService.deleteSafe(params.id, req.user.userId);

      res.status(200).json({ data: result, meta: null, error: null });
      return;
    } catch (err) {
      next(err);
      return;
    }
  }
}
