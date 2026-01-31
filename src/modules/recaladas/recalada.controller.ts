import type { Request, Response, NextFunction } from "express";
import { RecaladaService } from "./recalada.service";
import { UnauthorizedError } from "../../libs/errors";
import type {
  ListRecaladasQuery,
  GetRecaladaByIdParams,
  UpdateRecaladaParams,
  UpdateRecaladaBody,
  DeleteRecaladaParams,

  // ✅ NUEVOS
  ArriveRecaladaParams,
  ArriveRecaladaBody,
  DepartRecaladaParams,
  DepartRecaladaBody,
  CancelRecaladaParams,
  CancelRecaladaBody,
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

      const item = await RecaladaService.update(
        params.id,
        body,
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
   * PATCH /recaladas/:id/arrive
   * Marca recalada como ARRIVED y guarda arrivedAt
   * Auth: SUPERVISOR / SUPER_ADMIN (requireSupervisor en routes)
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
        params.id,
        body.arrivedAt,
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
   * PATCH /recaladas/:id/depart
   * Marca recalada como DEPARTED y guarda departedAt
   * Auth: SUPERVISOR / SUPER_ADMIN (requireSupervisor en routes)
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
        params.id,
        body.departedAt,
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
   * PATCH /recaladas/:id/cancel
   * Marca recalada como CANCELED y guarda canceledAt + cancelReason
   * Auth: SUPERVISOR / SUPER_ADMIN (requireSupervisor en routes)
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
        params.id,
        body.reason,
        req.user.userId,
        actorRol,
      );

      res.status(200).json({ data: item, meta: null, error: null });
      return;
    } catch (err) {
      next(err);
      return;
    }
  }

  /**
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

      const result = await RecaladaService.deleteSafe(
        params.id,
        req.user.userId,
      );

      res.status(200).json({ data: result, meta: null, error: null });
      return;
    } catch (err) {
      next(err);
      return;
    }
  }
}
