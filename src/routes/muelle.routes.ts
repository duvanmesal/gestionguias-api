import { Router } from "express"
import { requireAuth } from "../libs/auth"
import { requireSuperAdmin, requireSupervisor } from "../libs/rbac"
import { validate } from "../libs/zod-mw"
import { MuelleController } from "../modules/muelles/muelle.controller"
import {
  createMuelleSchema,
  idParamSchema,
  listMuelleQuerySchema,
  lookupMuelleQuerySchema,
  updateMuelleSchema,
} from "../modules/muelles/muelle.schemas"

const router = Router()

router.use(requireAuth)

router.get(
  "/lookup",
  requireSupervisor,
  validate({ query: lookupMuelleQuerySchema }),
  MuelleController.lookup,
)

router.get(
  "/",
  requireSupervisor,
  validate({ query: listMuelleQuerySchema }),
  MuelleController.list,
)

router.get(
  "/:id",
  requireSupervisor,
  validate({ params: idParamSchema }),
  MuelleController.get,
)

router.post(
  "/",
  requireSuperAdmin,
  validate({ body: createMuelleSchema }),
  MuelleController.create,
)

router.patch(
  "/:id",
  requireSupervisor,
  validate({ params: idParamSchema, body: updateMuelleSchema }),
  MuelleController.update,
)

router.delete(
  "/:id",
  requireSuperAdmin,
  validate({ params: idParamSchema }),
  MuelleController.remove,
)

export default router
