import type { Request, Response, NextFunction } from "express";
import { UnauthorizedError } from "../../libs/errors";
import { TurnoService } from "./turno.service";
import { logsService } from "../../libs/logs/logs.service";

import type {
  AssignTurnoBody,
  AssignTurnoParams,
  UnassignTurnoBody,
  UnassignTurnoParams,
  CheckInTurnoParams,
  CheckOutTurnoParams,
  NoShowTurnoBody,
  NoShowTurnoParams,
  ListTurnosQuery,
  ListTurnosMeQuery,
  GetTurnoByIdParams,
  ClaimTurnoParams,
  CancelTurnoBody,
  CancelTurnoParams,
} from "./turno.schemas";

export class TurnoController {
  static async list(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user?.userId)
        throw new UnauthorizedError("Authentication required");

      const query = req.query as unknown as ListTurnosQuery;
      const result = await TurnoService.list(req, query);

      logsService.audit(req, {
        event: "turnos.list.http_ok",
        target: { entity: "Turno" },
        meta: { returned: result.items.length, ...result.meta },
        message: "List turnos response sent",
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

  static async listMe(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user?.userId)
        throw new UnauthorizedError("Authentication required");

      const query = req.query as unknown as ListTurnosMeQuery;
      const result = await TurnoService.listMe(req, req.user.userId, query);

      logsService.audit(req, {
        event: "turnos.listMe.http_ok",
        target: { entity: "Turno" },
        meta: { returned: result.items.length, ...result.meta },
        message: "List my turnos response sent",
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

  static async getNextMe(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user?.userId)
        throw new UnauthorizedError("Authentication required");

      const item = await TurnoService.getNextMe(req, req.user.userId);

      logsService.audit(req, {
        event: "turnos.getNextMe.http_ok",
        target: { entity: "Turno", id: item?.id ? String(item.id) : undefined },
        meta: { found: !!item },
        message: "Get next turno response sent",
      });

      res.status(200).json({ data: item, meta: null, error: null });
      return;
    } catch (err) {
      next(err);
      return;
    }
  }

  static async getActiveMe(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user?.userId)
        throw new UnauthorizedError("Authentication required");

      const item = await TurnoService.getActiveMe(req, req.user.userId);

      logsService.audit(req, {
        event: "turnos.getActiveMe.http_ok",
        target: { entity: "Turno", id: item?.id ? String(item.id) : undefined },
        meta: { found: !!item },
        message: "Get active turno response sent",
      });

      res.status(200).json({ data: item, meta: null, error: null });
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

      const params = req.params as unknown as GetTurnoByIdParams;

      const item = await TurnoService.getByIdForActor(
        req,
        params.id,
        req.user.userId,
        req.user.rol,
      );

      logsService.audit(req, {
        event: "turnos.getById.http_ok",
        target: { entity: "Turno", id: String(params.id) },
        meta: { role: req.user.rol },
        message: "Get turno detail response sent",
      });

      res.status(200).json({ data: item, meta: null, error: null });
      return;
    } catch (err) {
      next(err);
      return;
    }
  }

  static async claim(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user?.userId)
        throw new UnauthorizedError("Authentication required");

      const params = req.params as unknown as ClaimTurnoParams;
      const item = await TurnoService.claim(req, params.id, req.user.userId);

      logsService.audit(req, {
        event: "turnos.claim.http_ok",
        target: { entity: "Turno", id: String(item.id) },
        meta: {
          atencionId: item.atencionId,
          guiaId: item.guiaId,
          status: item.status,
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

  static async assign(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user?.userId)
        throw new UnauthorizedError("Authentication required");

      const params = req.params as unknown as AssignTurnoParams;
      const body = req.body as AssignTurnoBody;

      const item = await TurnoService.assign(
        req,
        params.id,
        body.guiaId,
        req.user.userId,
      );

      logsService.audit(req, {
        event: "turnos.assign.http_ok",
        target: { entity: "Turno", id: String(item.id) },
        meta: { guiaId: body.guiaId, atencionId: item.atencionId },
        message: "Assign turno response sent",
      });

      res.status(200).json({ data: item, meta: null, error: null });
      return;
    } catch (err) {
      next(err);
      return;
    }
  }

  static async unassign(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user?.userId)
        throw new UnauthorizedError("Authentication required");

      const params = req.params as unknown as UnassignTurnoParams;
      const body = req.body as unknown as UnassignTurnoBody;

      const item = await TurnoService.unassign(
        req,
        params.id,
        body?.reason,
        req.user.userId,
      );

      logsService.audit(req, {
        event: "turnos.unassign.http_ok",
        target: { entity: "Turno", id: String(item.id) },
        meta: {
          atencionId: item.atencionId,
          status: item.status,
          reason: body?.reason ?? null,
        },
        message: "Unassign turno response sent",
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

      const params = req.params as unknown as CancelTurnoParams;
      const body = req.body as unknown as CancelTurnoBody;

      const item = await TurnoService.cancel(
        req,
        params.id,
        body?.cancelReason,
        req.user.userId,
      );

      logsService.audit(req, {
        event: "turnos.cancel.http_ok",
        target: { entity: "Turno", id: String(item.id) },
        meta: {
          atencionId: item.atencionId,
          cancelReason: body?.cancelReason ?? null,
        },
        message: "Cancel turno response sent",
      });

      res.status(200).json({ data: item, meta: null, error: null });
      return;
    } catch (err) {
      next(err);
      return;
    }
  }

  static async checkIn(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user?.userId)
        throw new UnauthorizedError("Authentication required");

      const params = req.params as unknown as CheckInTurnoParams;
      const item = await TurnoService.checkIn(req, params.id, req.user.userId);

      logsService.audit(req, {
        event: "turnos.checkin.http_ok",
        target: { entity: "Turno", id: String(item.id) },
        meta: {
          atencionId: item.atencionId,
          status: item.status,
          checkInAt: item.checkInAt,
        },
        message: "Check-in turno response sent",
      });

      res.status(200).json({ data: item, meta: null, error: null });
      return;
    } catch (err) {
      next(err);
      return;
    }
  }

  static async checkOut(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user?.userId)
        throw new UnauthorizedError("Authentication required");

      const params = req.params as unknown as CheckOutTurnoParams;
      const item = await TurnoService.checkOut(req, params.id, req.user.userId);

      logsService.audit(req, {
        event: "turnos.checkout.http_ok",
        target: { entity: "Turno", id: String(item.id) },
        meta: {
          atencionId: item.atencionId,
          status: item.status,
          checkOutAt: item.checkOutAt,
        },
        message: "Check-out turno response sent",
      });

      res.status(200).json({ data: item, meta: null, error: null });
      return;
    } catch (err) {
      next(err);
      return;
    }
  }

  static async noShow(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user?.userId)
        throw new UnauthorizedError("Authentication required");

      const params = req.params as unknown as NoShowTurnoParams;
      const body = req.body as unknown as NoShowTurnoBody;

      const item = await TurnoService.noShow(
        req,
        params.id,
        body?.reason,
        req.user.userId,
      );

      logsService.audit(req, {
        event: "turnos.noShow.http_ok",
        target: { entity: "Turno", id: String(item.id) },
        meta: {
          atencionId: item.atencionId,
          reason: body?.reason ?? null,
          status: item.status,
        },
        message: "No-show turno response sent",
      });

      res.status(200).json({ data: item, meta: null, error: null });
      return;
    } catch (err) {
      next(err);
      return;
    }
  }
}
