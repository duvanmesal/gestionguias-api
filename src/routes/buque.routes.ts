import express, { Router } from "express";
import { BuqueController } from "../modules/buques/buque.controller";

import { requireAuth } from "../libs/auth";
import { requireSuperAdmin, requireSupervisor } from "../libs/rbac";
import { validate } from "../libs/zod-mw";

import {
  listBuqueQuerySchema,
  createBuqueSchema,
  updateBuqueSchema,
  idParamSchema,
  bulkBuqueRequestSchema,
  bulkBuqueUploadQuerySchema,
} from "../modules/buques/buque.schemas";

const router = Router();

router.use(requireAuth);

router.get("/lookup", requireSupervisor, BuqueController.lookup);

router.get(
  "/",
  requireSupervisor,
  validate({ query: listBuqueQuerySchema }),
  BuqueController.list
);

router.get(
  "/:id",
  requireSupervisor,
  validate({ params: idParamSchema }),
  BuqueController.get
);

router.post(
  "/",
  requireSuperAdmin,
  validate({ body: createBuqueSchema }),
  BuqueController.create
);

// ✅ Bulk JSON
router.post(
  "/bulk",
  requireSuperAdmin,
  validate({ body: bulkBuqueRequestSchema }),
  BuqueController.bulk
);

// ✅ Bulk File (CSV/XLSX) - body raw
router.post(
  "/bulk/file",
  requireSuperAdmin,
  validate({ query: bulkBuqueUploadQuerySchema }),
  express.raw({
    type: [
      "text/csv",
      "text/plain",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/octet-stream",
    ],
    limit: "5mb",
  }),
  BuqueController.bulkFile
);

router.patch(
  "/:id",
  requireSupervisor,
  validate({ params: idParamSchema, body: updateBuqueSchema }),
  BuqueController.update
);

router.delete(
  "/:id",
  requireSuperAdmin,
  validate({ params: idParamSchema }),
  BuqueController.remove
);

export default router;