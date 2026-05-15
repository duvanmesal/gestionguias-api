import { Router } from "express"

import { requireAuth } from "../libs/auth"
import { validate } from "../libs/zod-mw"
import { NotificationController } from "../modules/notifications/notification.controller"
import {
  deletePushTokenBodySchema,
  pushTokenBodySchema,
} from "../modules/notifications/notification.schemas"

const router = Router()

router.use(requireAuth)

router.post(
  "/push-token",
  validate({ body: pushTokenBodySchema }),
  NotificationController.upsertPushToken,
)

router.delete(
  "/push-token",
  validate({ body: deletePushTokenBodySchema }),
  NotificationController.deactivatePushToken,
)

export default router
