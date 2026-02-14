import type { Request, Response, NextFunction } from "express";
import { UnauthorizedError } from "../../libs/errors";
import { DashboardService } from "./dashboard.service";
import type { OverviewQuery } from "./dashboard.schemas";

export class DashboardController {
  /**
   * GET /dashboard/overview
   * Resumen listo para pintar dashboard, por rol.
   */
  static async overview(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user?.userId) {
        throw new UnauthorizedError("Authentication required");
      }

      const query = req.query as unknown as OverviewQuery;

      const data = await DashboardService.getOverview({
        userId: req.user.userId,
        rol: req.user.rol,
        query,
      });

      res.status(200).json({ data, meta: null, error: null });
      return;
    } catch (err) {
      next(err);
      return;
    }
  }
}
