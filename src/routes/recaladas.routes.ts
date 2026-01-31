import { Router } from "express";
import { RecaladaController } from "../modules/recaladas/recalada.controller";

import { requireAuth } from "../libs/auth";
import { requireSupervisor } from "../libs/rbac";
import { validate } from "../libs/zod-mw";

import {
  createRecaladaSchema,
  listRecaladasQuerySchema,
  getRecaladaByIdParamsSchema, // ✅ ADICIÓN
} from "../modules/recaladas/recalada.schemas";

const router = Router();

router.use(requireAuth);

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
