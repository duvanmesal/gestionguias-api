// src/routes/admin-logs.routes.ts
//
// Proxy administrativo de SOLO LECTURA hacia el LogService.
// Acceso restringido a SUPER_ADMIN y SUPERVISOR (requireSupervisor).
// El JWT del usuario NUNCA llega al LogService: el controller usa la READ key
// del servidor internamente.
import { Router } from "express"
import { detectClientPlatform } from "../middlewares/clientPlatform"
import { requireAuth } from "../libs/auth"
import { requireCompletedProfile } from "../middlewares/require-completed-profile"
import { requireSupervisor } from "../libs/rbac"
import { adminLogsLimiter, adminLogsExportLimiter } from "../middlewares/rate-limit"
import { validate } from "../libs/zod-mw"

import { AdminLogsController } from "../modules/admin-logs/admin-logs.controller"
import {
  listLogsQuerySchema,
  statsLogsQuerySchema,
  logIdParamsSchema,
  exportLogsQuerySchema,
} from "../modules/admin-logs/admin-logs.schemas"

const router = Router()

// Cadena común: plataforma -> auth -> perfil completo -> rol -> rate limit.
router.use(
  detectClientPlatform,
  requireAuth,
  requireCompletedProfile,
  requireSupervisor,
  adminLogsLimiter,
)

/**
 * GET /admin/logs/stats
 * Agregados (byLevel, topEvents, errorsByDay) para el dashboard.
 * Auth: SUPER_ADMIN / SUPERVISOR
 * Nota: declarado antes de "/:id" para que "stats" no se interprete como id.
 */
router.get(
  "/stats",
  validate({ query: statsLogsQuerySchema }),
  AdminLogsController.stats,
)

/**
 * GET /admin/logs/export
 * Descarga CSV/JSON. Rango de fechas obligatorio + cap de filas.
 * Limiter dedicado (más estricto). Declarado antes de "/:id".
 * Auth: SUPER_ADMIN / SUPERVISOR
 */
router.get(
  "/export",
  adminLogsExportLimiter,
  validate({ query: exportLogsQuerySchema }),
  AdminLogsController.export,
)

/**
 * GET /admin/logs
 * Lista paginada de logs con filtros.
 * Auth: SUPER_ADMIN / SUPERVISOR
 */
router.get(
  "/",
  validate({ query: listLogsQuerySchema }),
  AdminLogsController.list,
)

/**
 * GET /admin/logs/:id
 * Detalle de un log. Preserva 404 si no existe.
 * Auth: SUPER_ADMIN / SUPERVISOR
 */
router.get(
  "/:id",
  validate({ params: logIdParamsSchema }),
  AdminLogsController.getById,
)

export default router
