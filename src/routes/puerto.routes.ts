import { Router } from "express"
import { requireAuth } from "../libs/auth"
import { requireSuperAdmin, requireSupervisor } from "../libs/rbac"
import { validate } from "../libs/zod-mw"
import { PuertoController } from "../modules/puertos/puerto.controller"
import {
  createPuertoSchema,
  idParamSchema,
  listPuertoQuerySchema,
  updatePuertoSchema,
} from "../modules/puertos/puerto.schemas"

const router = Router()

router.use(requireAuth)

router.get("/lookup", requireSupervisor, PuertoController.lookup)

router.get(
  "/",
  requireSupervisor,
  validate({ query: listPuertoQuerySchema }),
  PuertoController.list,
)

router.get(
  "/:id",
  requireSupervisor,
  validate({ params: idParamSchema }),
  PuertoController.get,
)

router.post(
  "/",
  requireSuperAdmin,
  validate({ body: createPuertoSchema }),
  PuertoController.create,
)

router.patch(
  "/:id",
  requireSupervisor,
  validate({ params: idParamSchema, body: updatePuertoSchema }),
  PuertoController.update,
)

router.delete(
  "/:id",
  requireSuperAdmin,
  validate({ params: idParamSchema }),
  PuertoController.remove,
)

export default router
