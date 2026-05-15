import type { NextFunction, Request, Response } from "express"

import { UnauthorizedError } from "../../libs/errors"
import {
  deactivatePushDeviceToken,
  upsertPushDeviceToken,
} from "./notification.service"
import type { DeletePushTokenBody, PushTokenBody } from "./notification.schemas"

export const NotificationController = {
  async upsertPushToken(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.userId
      if (!userId) throw new UnauthorizedError("Authentication required")

      const body = req.body as PushTokenBody
      const item = await upsertPushDeviceToken({
        userId,
        token: body.token,
        platform: body.platform,
        deviceId: body.deviceId,
      })

      res.status(200).json({
        data: item,
        meta: null,
        error: null,
      })
    } catch (error) {
      next(error)
    }
  },

  async deactivatePushToken(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.userId
      if (!userId) throw new UnauthorizedError("Authentication required")

      const body = req.body as DeletePushTokenBody
      const result = await deactivatePushDeviceToken({
        userId,
        token: body.token,
        deviceId: body.deviceId,
      })

      res.status(200).json({
        data: { deactivated: result.count },
        meta: null,
        error: null,
      })
    } catch (error) {
      next(error)
    }
  },
}
