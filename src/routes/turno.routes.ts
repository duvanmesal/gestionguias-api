import { Router } from "express";
import { requireAuth } from "../libs/auth";
import { requireSupervisor, requireGuia } from "../libs/rbac";
import { validate } from "../libs/zod-mw";

import { TurnoController } from "../modules/turnos/turno.controller";

import {
  assignTurnoParamsSchema,
  assignTurnoBodySchema,
  unassignTurnoParamsSchema,
  unassignTurnoBodySchema,
} from "../modules/turnos/turno.schemas";

const router = Router();

router.use(requireAuth);

/**
 * PATCH /turnos/:id/assign
 * Asigna un turno a un guía (modo supervisor)
 * Auth: SUPERVISOR / SUPER_ADMIN
 */
router.patch(
  "/:id/assign",
  requireSupervisor,
  validate({ params: assignTurnoParamsSchema, body: assignTurnoBodySchema }),
  TurnoController.assign
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
  TurnoController.unassign
);

export default router;
