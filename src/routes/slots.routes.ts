import { Router } from "express"
import { requireAuth } from "../libs/auth"
import { requireSuperAdmin, requireSupervisor } from "../libs/rbac"
import { validate } from "../libs/zod-mw"
import { SlotController } from "../modules/slots/slot.controller"
import { slotIdParamSchema, toggleSlotBodySchema } from "../modules/slots/slot.schemas"

const router = Router()

router.use(requireAuth)

router.get("/", requireSupervisor, SlotController.list)

router.patch(
  "/:id",
  requireSuperAdmin,
  validate({ params: slotIdParamSchema, body: toggleSlotBodySchema }),
  SlotController.toggle,
)

export default router
