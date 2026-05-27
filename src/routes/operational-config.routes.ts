import { Router } from "express"

import { requireAuth } from "../libs/auth"
import { requireSupervisor } from "../libs/rbac"
import { validate } from "../libs/zod-mw"
import { operationalConfigController } from "../modules/operational-config/operational-config.controller"
import {
  updateTurnoAssignmentModeSchema,
  updateNoShowPenaltyDurationSchema,
} from "../modules/operational-config/operational-config.schemas"

const router = Router()

router.use(requireAuth)

router.get("/", requireSupervisor, operationalConfigController.get.bind(operationalConfigController))

router.patch(
  "/turnos-assignment-mode",
  requireSupervisor,
  validate({ body: updateTurnoAssignmentModeSchema }),
  operationalConfigController.updateTurnoAssignmentMode.bind(operationalConfigController),
)

// Epica 6: duración de la penalización NO_SHOW (1–720 horas).
router.patch(
  "/no-show-penalty-duration",
  requireSupervisor,
  validate({ body: updateNoShowPenaltyDurationSchema }),
  operationalConfigController.updateNoShowPenaltyDuration.bind(operationalConfigController),
)

export default router
