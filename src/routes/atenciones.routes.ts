import { Router } from "express";
import { requireAuth } from "../libs/auth";
import { requireSupervisor } from "../libs/rbac";
import { validate } from "../libs/zod-mw";

import { AtencionController } from "../modules/atenciones/atencion.controller";

import {
  createAtencionSchema,
  listAtencionesQuerySchema,
  getAtencionByIdParamsSchema,
} from "../modules/atenciones/atencion.schemas";

const router = Router();

router.use(requireAuth);

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

export default router;
