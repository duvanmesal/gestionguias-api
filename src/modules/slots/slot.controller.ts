import type { Request, Response, NextFunction } from "express"
import { UnauthorizedError } from "../../libs/errors"
import { logsService } from "../../libs/logs/logs.service"
import { SlotService } from "./slot.service"
import type { SlotIdParam, ToggleSlotBody } from "./slot.schemas"

export class SlotController {
  static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user?.userId) throw new UnauthorizedError("Authentication required")
      const items = await SlotService.list()
      logsService.audit(req, {
        event: "slots.list.http_ok",
        target: { entity: "SlotOperativo" },
        meta: { count: items.length },
        message: "List slots response sent",
      })
      res.status(200).json({ data: items, meta: null, error: null })
    } catch (err) {
      next(err)
    }
  }

  static async toggle(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user?.userId) throw new UnauthorizedError("Authentication required")
      const { id } = req.params as unknown as SlotIdParam
      const { status, motivoInactividad } = req.body as ToggleSlotBody

      const item = await SlotService.toggle(id, status, motivoInactividad)

      logsService.audit(req, {
        event: "slots.toggle.http_ok",
        target: { entity: "SlotOperativo", id: String(id) },
        meta: { status, motivoInactividad: motivoInactividad ?? null },
        message: "Toggle slot response sent",
      })

      res.status(200).json({ data: item, meta: null, error: null })
    } catch (err) {
      next(err)
    }
  }
}
