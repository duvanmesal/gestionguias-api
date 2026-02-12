import { Router } from "express";
import { requireAuth } from "../libs/auth";
import { requireSupervisor, requireGuia } from "../libs/rbac";
import { validate } from "../libs/zod-mw";

import { TurnoController } from "../modules/turnos/turno.controller";

import {
  listTurnosQuerySchema,
  listTurnosMeQuerySchema,
  getTurnoByIdParamsSchema,
  assignTurnoParamsSchema,
  assignTurnoBodySchema,
  unassignTurnoParamsSchema,
  unassignTurnoBodySchema,
  checkInTurnoParamsSchema,
  checkOutTurnoParamsSchema,
  noShowTurnoParamsSchema,
  noShowTurnoBodySchema,
} from "../modules/turnos/turno.schemas";

const router = Router();

router.use(requireAuth);

/**
 * GET /turnos
 * Lista global (panel)
 * Auth: SUPERVISOR / SUPER_ADMIN
 */
router.get(
  "/",
  requireSupervisor,
  validate({ query: listTurnosQuerySchema }),
  TurnoController.list,
);

/**
 * GET /turnos/me
 * Lista “mis turnos” (guía autenticado)
 * Auth: GUIA
 */
router.get(
  "/me",
  requireGuia,
  validate({ query: listTurnosMeQuerySchema }),
  TurnoController.listMe,
);

/**
 * GET /turnos/me/next
 * Próximo turno del guía autenticado
 * Auth: GUIA
 */
router.get("/me/next", requireGuia, TurnoController.getNextMe);

/**
 * GET /turnos/me/active
 * Turno activo del guía autenticado (IN_PROGRESS)
 * Auth: GUIA
 */
router.get("/me/active", requireGuia, TurnoController.getActiveMe);

/**
 * GET /turnos/:id
 * Detalle
 * Auth: SUPERVISOR / SUPER_ADMIN
 */
router.get(
  "/:id",
  requireSupervisor,
  validate({ params: getTurnoByIdParamsSchema }),
  TurnoController.getById,
);

/**
 * PATCH /turnos/:id/assign
 * Asigna un turno a un guía (modo supervisor)
 * Auth: SUPERVISOR / SUPER_ADMIN
 */
router.patch(
  "/:id/assign",
  requireSupervisor,
  validate({ params: assignTurnoParamsSchema, body: assignTurnoBodySchema }),
  TurnoController.assign,
);

/**
 * PATCH /turnos/:id/unassign
 * Desasigna un turno (modo supervisor)
 * Auth: SUPERVISOR / SUPER_ADMIN
 */
router.patch(
  "/:id/unassign",
  requireSupervisor,
  validate({ params: unassignTurnoParamsSchema, body: unassignTurnoBodySchema }),
  TurnoController.unassign,
);

/**
 * PATCH /turnos/:id/check-in
 * Marca inicio oficial del turno (check-in)
 * Auth: GUIA
 */
router.patch(
  "/:id/check-in",
  requireGuia,
  validate({ params: checkInTurnoParamsSchema }),
  TurnoController.checkIn,
);

/**
 * PATCH /turnos/:id/check-out
 * Marca fin del turno (check-out)
 * Auth: GUIA
 */
router.patch(
  "/:id/check-out",
  requireGuia,
  validate({ params: checkOutTurnoParamsSchema }),
  TurnoController.checkOut,
);

/**
 * PATCH /turnos/:id/no-show
 * Marca un turno como ausente (no-show)
 * Auth: SUPERVISOR / SUPER_ADMIN
 */
router.patch(
  "/:id/no-show",
  requireSupervisor,
  validate({ params: noShowTurnoParamsSchema, body: noShowTurnoBodySchema }),
  TurnoController.noShow,
);

export default router;
