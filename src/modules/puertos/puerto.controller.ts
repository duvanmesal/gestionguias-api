import type { NextFunction, Request, Response } from "express"
import { UnauthorizedError } from "../../libs/errors"
import { logsService } from "../../libs/logs/logs.service"
import { PuertoService } from "./puerto.service"
import type {
  CreatePuertoBody,
  IdParam,
  ListPuertoQuery,
  UpdatePuertoBody,
} from "./puerto.schemas"

export class PuertoController {
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user?.userId) throw new UnauthorizedError("Authentication required")
      const result = await PuertoService.list(req, req.query as unknown as ListPuertoQuery)

      logsService.audit(req, {
        event: "puertos.list.http_ok",
        target: { entity: "Puerto" },
        meta: { returned: result.items.length, ...result.meta },
        message: "List puertos response sent",
      })

      res.status(200).json({ data: result.items, meta: result.meta, error: null })
    } catch (err) {
      next(err)
    }
  }

  static async get(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user?.userId) throw new UnauthorizedError("Authentication required")
      const { id } = req.params as unknown as IdParam
      const item = await PuertoService.get(req, id)

      logsService.audit(req, {
        event: "puertos.get.http_ok",
        target: { entity: "Puerto", id: String(id) },
        meta: { id },
        message: "Get puerto response sent",
      })

      res.status(200).json({ data: item, meta: null, error: null })
    } catch (err) {
      next(err)
    }
  }

  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user?.userId) throw new UnauthorizedError("Authentication required")
      const item = await PuertoService.create(req, req.body as CreatePuertoBody)

      logsService.audit(req, {
        event: "puertos.create.http_ok",
        target: { entity: "Puerto", id: String(item.id) },
        meta: { id: item.id, codigo: item.codigo, paisId: item.pais.id },
        message: "Create puerto response sent",
      })

      res.status(201).json({ data: item, meta: null, error: null })
    } catch (err) {
      next(err)
    }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user?.userId) throw new UnauthorizedError("Authentication required")
      const { id } = req.params as unknown as IdParam
      const body = req.body as UpdatePuertoBody
      const item = await PuertoService.update(req, id, body)

      logsService.audit(req, {
        event: "puertos.update.http_ok",
        target: { entity: "Puerto", id: String(id) },
        meta: { id, updatedKeys: Object.keys(body ?? {}) },
        message: "Update puerto response sent",
      })

      res.status(200).json({ data: item, meta: null, error: null })
    } catch (err) {
      next(err)
    }
  }

  static async remove(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user?.userId) throw new UnauthorizedError("Authentication required")
      const { id } = req.params as unknown as IdParam
      const item = await PuertoService.remove(req, id)

      logsService.audit(req, {
        event: "puertos.remove.http_ok",
        target: { entity: "Puerto", id: String(id) },
        meta: { id },
        message: "Remove puerto response sent",
      })

      res.status(200).json({ data: item, meta: null, error: null })
    } catch (err) {
      next(err)
    }
  }

  static async lookup(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user?.userId) throw new UnauthorizedError("Authentication required")
      const items = await PuertoService.lookup(req)

      logsService.audit(req, {
        event: "puertos.lookup.http_ok",
        target: { entity: "Puerto" },
        meta: { returned: items.length },
        message: "Lookup puertos response sent",
      })

      res.status(200).json({ data: items, meta: null, error: null })
    } catch (err) {
      next(err)
    }
  }
}
