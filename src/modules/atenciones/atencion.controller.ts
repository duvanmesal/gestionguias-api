import type { Request, Response, NextFunction } from "express";
import { UnauthorizedError } from "../../libs/errors";
import { AtencionService } from "./atencion.service";
import type {
  CreateAtencionBody,
  ListAtencionesQuery,
  GetAtencionByIdParams,

  // NEW existing
  UpdateAtencionParams,
  UpdateAtencionBody,
  CancelAtencionParams,
  CancelAtencionBody,
  CloseAtencionParams,

  // NEW for turnero/summary
  GetAtencionTurnosParams,
  GetAtencionSummaryParams,
  ClaimAtencionParams,
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
   * GET /atenciones/:id/turnos
   * Lista todos los slots (turnos) de una atención, ordenados por numero ASC.
   * Auth: GUIA / SUPERVISOR / SUPER_ADMIN
   */
  static async listTurnos(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user?.userId) {
        throw new UnauthorizedError("Authentication required");
      }

      const params = req.params as unknown as GetAtencionTurnosParams;

      const items = await AtencionService.listTurnosByAtencionId(params.id);

      res.status(200).json({ data: items, meta: null, error: null });
      return;
    } catch (err) {
      next(err);
      return;
    }
  }

  /**
   * GET /atenciones/:id/summary
   * Resumen de cupos por estado.
   * Auth: GUIA / SUPERVISOR / SUPER_ADMIN
   */
  static async getSummary(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user?.userId) {
        throw new UnauthorizedError("Authentication required");
      }

      const params = req.params as unknown as GetAtencionSummaryParams;

      const summary = await AtencionService.getSummaryByAtencionId(params.id);

      res.status(200).json({ data: summary, meta: null, error: null });
      return;
    } catch (err) {
      next(err);
      return;
    }
  }

  /**
   * POST /atenciones/:id/claim
   * Autoclaim: toma el primer turno AVAILABLE por numero ASC y lo asigna al guía autenticado.
   * Auth: GUIA (requireGuia en routes)
   */
  static async claimTurno(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user?.userId) {
        throw new UnauthorizedError("Authentication required");
      }

      const params = req.params as unknown as ClaimAtencionParams;

      const item = await AtencionService.claimFirstAvailableTurno(
        params.id,
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

      const item = await AtencionService.update(
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
