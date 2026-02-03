import type { Request, Response, NextFunction } from "express";
import { UnauthorizedError } from "../../libs/errors";

import { TurnoService } from "./turno.service";
import type {
  AssignTurnoBody,
  AssignTurnoParams,
  UnassignTurnoBody,
  UnassignTurnoParams,
  CheckInTurnoParams,
  CheckOutTurnoParams,
  NoShowTurnoBody,
  NoShowTurnoParams,
} from "./turno.schemas";

export class TurnoController {
  /**
   * PATCH /turnos/:id/assign
   * Asigna un turno a un guía (modo supervisor)
   * Auth: SUPERVISOR / SUPER_ADMIN (en routes)
   */
  static async assign(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user?.userId) {
        throw new UnauthorizedError("Authentication required");
      }

      const params = req.params as unknown as AssignTurnoParams;
      const body = req.body as AssignTurnoBody;

      const item = await TurnoService.assign(
        params.id,
        body.guiaId,
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
   * PATCH /turnos/:id/unassign
   * Desasigna un turno (modo supervisor)
   * Auth: SUPERVISOR / SUPER_ADMIN (en routes)
   */
  static async unassign(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user?.userId) {
        throw new UnauthorizedError("Authentication required");
      }

      const params = req.params as unknown as UnassignTurnoParams;
      const body = req.body as unknown as UnassignTurnoBody;

      const item = await TurnoService.unassign(
        params.id,
        body?.reason,
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
   * PATCH /turnos/:id/check-in
   * Auth: GUIA (en routes)
   */
  static async checkIn(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user?.userId) {
        throw new UnauthorizedError("Authentication required");
      }

      const params = req.params as unknown as CheckInTurnoParams;

      const item = await TurnoService.checkIn(params.id, req.user.userId);

      res.status(200).json({ data: item, meta: null, error: null });
      return;
    } catch (err) {
      next(err);
      return;
    }
  }

  /**
   * PATCH /turnos/:id/check-out
   * Auth: GUIA (en routes)
   */
  static async checkOut(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user?.userId) {
        throw new UnauthorizedError("Authentication required");
      }

      const params = req.params as unknown as CheckOutTurnoParams;

      const item = await TurnoService.checkOut(params.id, req.user.userId);

      res.status(200).json({ data: item, meta: null, error: null });
      return;
    } catch (err) {
      next(err);
      return;
    }
  }

  /**
   * PATCH /turnos/:id/no-show
   * Auth: SUPERVISOR / SUPER_ADMIN (en routes)
   */
  static async noShow(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user?.userId) {
        throw new UnauthorizedError("Authentication required");
      }

      const params = req.params as unknown as NoShowTurnoParams;
      const body = req.body as unknown as NoShowTurnoBody;

      const item = await TurnoService.noShow(
        params.id,
        body?.reason,
        req.user.userId,
      );

      res.status(200).json({ data: item, meta: null, error: null });
      return;
    } catch (err) {
      next(err);
      return;
    }
  }
}
