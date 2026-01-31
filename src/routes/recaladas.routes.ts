import { Router } from "express";
import { RecaladaController } from "../modules/recaladas/recalada.controller";

import { requireAuth } from "../libs/auth";
import { requireSupervisor } from "../libs/rbac";
import { validate } from "../libs/zod-mw";

import {
  createRecaladaSchema,
  listRecaladasQuerySchema,
  getRecaladaByIdParamsSchema,
  updateRecaladaParamsSchema,
  updateRecaladaBodySchema,
  deleteRecaladaParamsSchema,

  arriveRecaladaParamsSchema,
  arriveRecaladaBodySchema,
  departRecaladaParamsSchema,
  departRecaladaBodySchema,
  cancelRecaladaParamsSchema,
  cancelRecaladaBodySchema,
} from "../modules/recaladas/recalada.schemas";

const router = Router();

router.use(requireAuth);

/**
 * DELETE /recaladas/:id
 * Elimina físicamente una recalada SOLO si es "safe"
 * Auth: SUPERVISOR / SUPER_ADMIN
 */
router.delete(
  "/:id",
  requireSupervisor,
  validate({ params: deleteRecaladaParamsSchema }),
  RecaladaController.delete
);

/**
 * PATCH /recaladas/:id
 * Edita una recalada (parcial) según reglas de negocio
 * Auth: SUPERVISOR / SUPER_ADMIN
 */
router.patch(
  "/:id",
  requireSupervisor,
  validate({ params: updateRecaladaParamsSchema, body: updateRecaladaBodySchema }),
  RecaladaController.update
);

/**
 * PATCH /recaladas/:id/arrive
 * Marca recalada como ARRIVED y guarda arrivedAt
 * Auth: SUPERVISOR / SUPER_ADMIN
 */
router.patch(
  "/:id/arrive",
  requireSupervisor,
  validate({ params: arriveRecaladaParamsSchema, body: arriveRecaladaBodySchema }),
  RecaladaController.arrive
);

/**
 * PATCH /recaladas/:id/depart
 * Marca recalada como DEPARTED y guarda departedAt
 * Auth: SUPERVISOR / SUPER_ADMIN
 */
router.patch(
  "/:id/depart",
  requireSupervisor,
  validate({ params: departRecaladaParamsSchema, body: departRecaladaBodySchema }),
  RecaladaController.depart
);

/**
 * PATCH /recaladas/:id/cancel
 * Marca recalada como CANCELED y guarda canceledAt + cancelReason
 * Auth: SUPERVISOR / SUPER_ADMIN
 */
router.patch(
  "/:id/cancel",
  requireSupervisor,
  validate({ params: cancelRecaladaParamsSchema, body: cancelRecaladaBodySchema }),
  RecaladaController.cancel
);

/**
 * GET /recaladas/:id
 * Detalle de una recalada
 * Auth: GUIA / SUPERVISOR / SUPER_ADMIN
 */
router.get(
  "/:id",
  validate({ params: getRecaladaByIdParamsSchema }),
  RecaladaController.getById
);

/**
 * GET /recaladas
 * Lista recaladas con filtros (vista tipo agenda)
 * Auth: GUIA / SUPERVISOR / SUPER_ADMIN
 */
router.get(
  "/",
  validate({ query: listRecaladasQuerySchema }),
  RecaladaController.list
);

/**
 * POST /recaladas
 * Crea una recalada (agenda madre)
 * Auth: SUPERVISOR / SUPER_ADMIN (requireSupervisor)
 */
router.post(
  "/",
  requireSupervisor,
  validate({ body: createRecaladaSchema }),
  RecaladaController.create
);

export default router;
