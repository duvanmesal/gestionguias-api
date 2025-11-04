import { Router } from "express";
import { BuqueController } from "../modules/buques/buque.controller";

import { requireAuth } from "../libs/auth";
import { requireSuperAdmin, requireSupervisor } from "../libs/rbac";
import { validate } from "../libs/zod-mw";

import {
  listBuqueQuerySchema,
  createBuqueSchema,
  updateBuqueSchema,
  idParamSchema,
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
