import type { Request, Response, NextFunction } from "express"
import { UnauthorizedError } from "../../libs/errors"
import { logsService } from "../../libs/logs/logs.service"
import { BuqueService } from "./buque.service"

import type {
  IdParam,
  ListBuqueQuery,
  CreateBuqueBody,
  UpdateBuqueBody,
} from "./buque.schemas"

export class BuqueController {
  static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user?.userId) throw new UnauthorizedError("Authentication required")

      const query = req.query as unknown as ListBuqueQuery
      const result = await BuqueService.list(req, query)

      logsService.audit(req, {
        event: "buques.list.http_ok",
        target: { entity: "Buque" },
        meta: { returned: result.items.length, ...result.meta },
        message: "List buques response sent",
      })

      res.status(200).json({ data: result.items, meta: result.meta, error: null })
      return
    } catch (err) {
      next(err)
      return
    }
  }

  static async get(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user?.userId) throw new UnauthorizedError("Authentication required")

      const { id } = req.params as unknown as IdParam
      const item = await BuqueService.get(req, id)

      logsService.audit(req, {
        event: "buques.get.http_ok",
        target: { entity: "Buque", id: String(id) },
        meta: { id },
        message: "Get buque response sent",
      })

      res.status(200).json({ data: item, meta: null, error: null })
      return
    } catch (err) {
      next(err)
      return
    }
  }

  static async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user?.userId) throw new UnauthorizedError("Authentication required")

      const body = req.body as CreateBuqueBody
      const item = await BuqueService.create(req, body)

      logsService.audit(req, {
        event: "buques.create.http_ok",
        target: { entity: "Buque", id: String(item.id) },
        meta: { id: item.id, codigo: item.codigo, nombre: item.nombre },
        message: "Create buque response sent",
      })

      res.status(201).json({ data: item, meta: null, error: null })
      return
    } catch (err) {
      next(err)
      return
    }
  }

  static async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user?.userId) throw new UnauthorizedError("Authentication required")

      const { id } = req.params as unknown as IdParam
      const body = req.body as UpdateBuqueBody

      const item = await BuqueService.update(req, id, body)

      logsService.audit(req, {
        event: "buques.update.http_ok",
        target: { entity: "Buque", id: String(id) },
        meta: { id },
        message: "Update buque response sent",
      })

      res.status(200).json({ data: item, meta: null, error: null })
      return
    } catch (err) {
      next(err)
      return
    }
  }

  static async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user?.userId) throw new UnauthorizedError("Authentication required")

      const { id } = req.params as unknown as IdParam
      const item = await BuqueService.remove(req, id)

      logsService.audit(req, {
        event: "buques.remove.http_ok",
        target: { entity: "Buque", id: String(id) },
        meta: { id, status: (item as any)?.status },
        message: "Remove buque response sent",
      })

      res.status(200).json({ data: item, meta: null, error: null })
      return
    } catch (err) {
      next(err)
      return
    }
  }

  static async lookup(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user?.userId) throw new UnauthorizedError("Authentication required")

      const items = await BuqueService.lookup(req)

      logsService.audit(req, {
        event: "buques.lookup.http_ok",
        target: { entity: "Buque" },
        meta: { returned: items.length },
        message: "Lookup buques response sent",
      })

      res.status(200).json({ data: items, meta: null, error: null })
      return
    } catch (err) {
      next(err)
      return
    }
  }
}