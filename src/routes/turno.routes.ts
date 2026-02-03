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
  checkInTurnoParamsSchema,
  checkOutTurnoParamsSchema,
  noShowTurnoParamsSchema,
  noShowTurnoBodySchema,
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

/**
 * PATCH /turnos/:id/check-in
 * Marca inicio oficial del turno (check-in)
 * Reglas: status debe ser ASSIGNED, set checkInAt=now(), status=IN_PROGRESS
 * Auth: GUIA
 */
router.patch(
  "/:id/check-in",
  requireGuia,
  validate({ params: checkInTurnoParamsSchema }),
  TurnoController.checkIn
);

/**
 * PATCH /turnos/:id/check-out
 * Marca fin del turno (check-out)
 * Reglas: status debe ser IN_PROGRESS, set checkOutAt=now(), status=COMPLETED
 * Auth: GUIA
 */
router.patch(
  "/:id/check-out",
  requireGuia,
  validate({ params: checkOutTurnoParamsSchema }),
  TurnoController.checkOut
);

/**
 * PATCH /turnos/:id/no-show
 * Marca un turno como ausente (no-show)
 * Reglas: status debe ser ASSIGNED, status=NO_SHOW, opcional reason
 * Auth: SUPERVISOR / SUPER_ADMIN
 */
router.patch(
  "/:id/no-show",
  requireSupervisor,
  validate({ params: noShowTurnoParamsSchema, body: noShowTurnoBodySchema }),
  TurnoController.noShow
);

export default router;
