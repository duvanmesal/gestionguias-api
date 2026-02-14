import { Router } from "express";
import { requireAuth } from "../libs/auth";
import { validate } from "../libs/zod-mw";

import { DashboardController } from "../modules/dashboard/dashboard.controller";
import { overviewQuerySchema } from "../modules/dashboard/dashboard.schemas";

const router = Router();

router.use(requireAuth);

/**
 * GET /dashboard/overview
 * Resumen listo para pintar dashboard, por rol.
 * Auth: GUIA / SUPERVISOR / SUPER_ADMIN
 */
router.get(
  "/overview",
  validate({ query: overviewQuerySchema }),
  DashboardController.overview
);

export default router;
