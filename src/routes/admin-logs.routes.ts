// src/routes/admin-logs.routes.ts
//
// Proxy administrativo hacia el LogService.
// Rutas con path literal SIEMPRE declaradas antes de "/:id".
// Auth mínimo: SUPERVISOR (reads). Mutaciones de alert_rules: SUPER_ADMIN.
import { Router } from "express"
import { detectClientPlatform } from "../middlewares/clientPlatform"
import { requireAuth } from "../libs/auth"
import { requireCompletedProfile } from "../middlewares/require-completed-profile"
import { requireSupervisor, requireSuperAdmin } from "../libs/rbac"
import { adminLogsLimiter, adminLogsExportLimiter } from "../middlewares/rate-limit"
import { validate } from "../libs/zod-mw"

import { AdminLogsController } from "../modules/admin-logs/admin-logs.controller"
import {
  listLogsQuerySchema,
  statsLogsQuerySchema,
  logIdParamsSchema,
  exportLogsQuerySchema,
  facetsLogsQuerySchema,
  timelineLogsQuerySchema,
  createAlertRuleBodySchema,
  updateAlertRuleBodySchema,
  alertRuleIdParamsSchema,
  alertsEvaluateQuerySchema,
} from "../modules/admin-logs/admin-logs.schemas"

const router = Router()

// Cadena común: plataforma -> auth -> perfil completo -> rol mínimo -> rate limit.
router.use(
  detectClientPlatform,
  requireAuth,
  requireCompletedProfile,
  requireSupervisor,
  adminLogsLimiter,
)

// ── Rutas literales — deben ir ANTES de /:id ────────────────────────────

router.get(
  "/stats",
  validate({ query: statsLogsQuerySchema }),
  AdminLogsController.stats,
)

router.get(
  "/export",
  adminLogsExportLimiter,
  validate({ query: exportLogsQuerySchema }),
  AdminLogsController.export,
)

router.get(
  "/facets",
  validate({ query: facetsLogsQuerySchema }),
  AdminLogsController.facets,
)

router.get(
  "/timeline",
  validate({ query: timelineLogsQuerySchema }),
  AdminLogsController.timeline,
)

// Alert rules — reads (SUPERVISOR)
router.get("/alerts/rules", AdminLogsController.alertRulesList)
router.get(
  "/alerts/rules/:id",
  validate({ params: alertRuleIdParamsSchema }),
  AdminLogsController.alertRulesGetById,
)
router.get(
  "/alerts/evaluate",
  validate({ query: alertsEvaluateQuerySchema }),
  AdminLogsController.alertsEvaluate,
)

// Alert rules — mutations (SUPER_ADMIN)
router.post(
  "/alerts/rules",
  requireSuperAdmin,
  validate({ body: createAlertRuleBodySchema }),
  AdminLogsController.alertRulesCreate,
)
router.patch(
  "/alerts/rules/:id",
  requireSuperAdmin,
  validate({ params: alertRuleIdParamsSchema, body: updateAlertRuleBodySchema }),
  AdminLogsController.alertRulesUpdate,
)
router.delete(
  "/alerts/rules/:id",
  requireSuperAdmin,
  validate({ params: alertRuleIdParamsSchema }),
  AdminLogsController.alertRulesDelete,
)

// ── Lista paginada ───────────────────────────────────────────────────────
router.get(
  "/",
  validate({ query: listLogsQuerySchema }),
  AdminLogsController.list,
)

// ── Detalle por id — al final para no capturar rutas literales ───────────
router.get(
  "/:id",
  validate({ params: logIdParamsSchema }),
  AdminLogsController.getById,
)

export default router
