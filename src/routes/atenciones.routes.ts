import { Router } from "express";
import { requireAuth } from "../libs/auth";
import { requireSupervisor } from "../libs/rbac";
import { validate } from "../libs/zod-mw";

import { AtencionController } from "../modules/atenciones/atencion.controller";

import {
  createAtencionSchema,
  listAtencionesQuerySchema,
  getAtencionByIdParamsSchema,
  updateAtencionParamsSchema,
  updateAtencionBodySchema,
  cancelAtencionParamsSchema,
  cancelAtencionBodySchema,
  closeAtencionParamsSchema,
  getAtencionTurnosParamsSchema,
  getAtencionSummaryParamsSchema,
} from "../modules/atenciones/atencion.schemas";

const router = Router();

router.use(requireAuth);

/**
 * GET /atenciones/:id/turnos
 * Lista todos los slots (turnos) de una atención, ordenados por numero ASC.
 * Auth: GUIA / SUPERVISOR / SUPER_ADMIN
 */
router.get(
  "/:id/turnos",
  validate({ params: getAtencionTurnosParamsSchema }),
  AtencionController.listTurnos
);

/**
 * GET /atenciones/:id/summary
 * Resumen de cupos por estado (para UI rápida: cards/contadores)
 * Auth: GUIA / SUPERVISOR / SUPER_ADMIN
 */
router.get(
  "/:id/summary",
  validate({ params: getAtencionSummaryParamsSchema }),
  AtencionController.getSummary
);

/**
 * GET /atenciones/:id
 * Detalle de una atención (para vista detalle / edición)
 * Auth: GUIA / SUPERVISOR / SUPER_ADMIN
 */
router.get(
  "/:id",
  validate({ params: getAtencionByIdParamsSchema }),
  AtencionController.getById
);

/**
 * GET /atenciones
 * Lista atenciones con filtros/paginación
 * Auth: GUIA / SUPERVISOR / SUPER_ADMIN
 */
router.get(
  "/",
  validate({ query: listAtencionesQuerySchema }),
  AtencionController.list
);

/**
 * POST /atenciones
 * Crea una atención (ventana + cupo)
 * Auth: SUPERVISOR / SUPER_ADMIN
 */
router.post(
  "/",
  requireSupervisor,
  validate({ body: createAtencionSchema }),
  AtencionController.create
);

/**
 * PATCH /atenciones/:id
 * Edita ventana/cupo/descripcion/estado admin
 * Auth: SUPERVISOR / SUPER_ADMIN
 */
router.patch(
  "/:id",
  requireSupervisor,
  validate({ params: updateAtencionParamsSchema, body: updateAtencionBodySchema }),
  AtencionController.update
);

/**
 * PATCH /atenciones/:id/cancel
 * Cancela atención con razón + auditoría (sin borrar)
 * Auth: SUPERVISOR / SUPER_ADMIN
 */
router.patch(
  "/:id/cancel",
  requireSupervisor,
  validate({ params: cancelAtencionParamsSchema, body: cancelAtencionBodySchema }),
  AtencionController.cancel
);

/**
 * PATCH /atenciones/:id/close
 * Cierra atención (operationalStatus -> CLOSED)
 * Auth: SUPERVISOR / SUPER_ADMIN
 */
router.patch(
  "/:id/close",
  requireSupervisor,
  validate({ params: closeAtencionParamsSchema }),
  AtencionController.close
);

export default router;
