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
} from "../modules/recaladas/recalada.schemas";

const router = Router();

router.use(requireAuth);

/**
 * ✅ ADICIÓN
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
 * ✅ ADICIÓN
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
