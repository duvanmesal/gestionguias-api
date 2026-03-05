import express, { Router } from "express";
import { PaisController } from "../modules/paises/pais.controller";

import { requireAuth } from "../libs/auth";
import { requireSuperAdmin, requireSupervisor } from "../libs/rbac";
import { validate } from "../libs/zod-mw";

import {
  listPaisQuerySchema,
  createPaisSchema,
  updatePaisSchema,
  idParamSchema,
  bulkPaisRequestSchema,
  bulkPaisUploadQuerySchema,
} from "../modules/paises/pais.schemas";

const router = Router();

router.use(requireAuth);

router.get("/lookup", requireSupervisor, PaisController.lookup);

router.get(
  "/",
  requireSupervisor,
  validate({ query: listPaisQuerySchema }),
  PaisController.list
);

router.get(
  "/:id",
  requireSupervisor,
  validate({ params: idParamSchema }),
  PaisController.get
);

router.post(
  "/",
  requireSuperAdmin,
  validate({ body: createPaisSchema }),
  PaisController.create
);

// Bulk JSON
router.post(
  "/bulk",
  requireSuperAdmin,
  validate({ body: bulkPaisRequestSchema }),
  PaisController.bulk
);

// Bulk File (CSV/XLSX) - body raw
router.post(
  "/bulk/file",
  requireSuperAdmin,
  validate({ query: bulkPaisUploadQuerySchema }),
  express.raw({
    type: [
      "text/csv",
      "text/plain",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/octet-stream",
    ],
    limit: "5mb",
  }),
  PaisController.bulkFile
);

router.patch(
  "/:id",
  requireSupervisor,
  validate({ params: idParamSchema, body: updatePaisSchema }),
  PaisController.update
);

router.delete(
  "/:id",
  requireSuperAdmin,
  validate({ params: idParamSchema }),
  PaisController.remove
);

export default router;