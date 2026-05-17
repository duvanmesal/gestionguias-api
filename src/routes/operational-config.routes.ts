import { Router } from "express"

import { requireAuth } from "../libs/auth"
import { requireSupervisor } from "../libs/rbac"
import { validate } from "../libs/zod-mw"
import { operationalConfigController } from "../modules/operational-config/operational-config.controller"
import { updateTurnoAssignmentModeSchema } from "../modules/operational-config/operational-config.schemas"

const router = Router()

router.use(requireAuth)

router.get("/", requireSupervisor, operationalConfigController.get.bind(operationalConfigController))

router.patch(
  "/turnos-assignment-mode",
  requireSupervisor,
  validate({ body: updateTurnoAssignmentModeSchema }),
  operationalConfigController.updateTurnoAssignmentMode.bind(operationalConfigController),
)

export default router
