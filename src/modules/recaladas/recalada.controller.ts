import type { Request, Response, NextFunction } from "express";
import { RecaladaService } from "./recalada.service";
import { UnauthorizedError } from "../../libs/errors";
import type { ListRecaladasQuery } from "./recalada.schemas";

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
}
