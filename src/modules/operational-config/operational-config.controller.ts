import type { NextFunction, Request, Response } from "express"

import { ok } from "../../libs/http"
import { operationalConfigService } from "./operational-config.service"
import type { UpdateTurnoAssignmentModeBody } from "./operational-config.schemas"

export class OperationalConfigController {
  async get(_req: Request, res: Response, next: NextFunction) {
    try {
      const config = await operationalConfigService.get()
      res.json(ok(config))
    } catch (error) {
      next(error)
    }
  }

  async updateTurnoAssignmentMode(req: Request, res: Response, next: NextFunction) {
    try {
      const actorUserId = req.user!.userId
      const body = req.body as UpdateTurnoAssignmentModeBody
      const config = await operationalConfigService.updateTurnoAssignmentMode(
        req,
        body.mode,
        actorUserId,
      )
      res.json(ok(config))
    } catch (error) {
      next(error)
    }
  }
}

export const operationalConfigController = new OperationalConfigController()
