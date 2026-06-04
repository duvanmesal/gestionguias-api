import type { NextFunction, Request, Response } from "express"
import { UnauthorizedError } from "../../libs/errors"
import { logsService } from "../../libs/logs/logs.service"
import { MuelleService } from "./muelle.service"
import type {
  CreateMuelleBody,
  IdParam,
  ListMuelleQuery,
  LookupMuelleQuery,
  UpdateMuelleBody,
} from "./muelle.schemas"

export class MuelleController {
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user?.userId) throw new UnauthorizedError("Authentication required")
      const result = await MuelleService.list(req, req.query as unknown as ListMuelleQuery)

      logsService.audit(req, {
        event: "muelles.list.http_ok",
        target: { entity: "Muelle" },
        meta: { returned: result.items.length, ...result.meta },
        message: "List muelles response sent",
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
      const item = await MuelleService.get(req, id)

      logsService.audit(req, {
        event: "muelles.get.http_ok",
        target: { entity: "Muelle", id: String(id) },
        meta: { id },
        message: "Get muelle response sent",
      })

      res.status(200).json({ data: item, meta: null, error: null })
    } catch (err) {
      next(err)
    }
  }

  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user?.userId) throw new UnauthorizedError("Authentication required")
      const item = await MuelleService.create(req, req.body as CreateMuelleBody)

      logsService.audit(req, {
        event: "muelles.create.http_ok",
        target: { entity: "Muelle", id: String(item.id) },
        meta: { id: item.id, codigo: item.codigo, puertoId: item.puerto.id },
        message: "Create muelle response sent",
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
      const body = req.body as UpdateMuelleBody
      const item = await MuelleService.update(req, id, body)

      logsService.audit(req, {
        event: "muelles.update.http_ok",
        target: { entity: "Muelle", id: String(id) },
        meta: { id, updatedKeys: Object.keys(body ?? {}) },
        message: "Update muelle response sent",
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
      const item = await MuelleService.remove(req, id)

      logsService.audit(req, {
        event: "muelles.remove.http_ok",
        target: { entity: "Muelle", id: String(id) },
        meta: { id },
        message: "Remove muelle response sent",
      })

      res.status(200).json({ data: item, meta: null, error: null })
    } catch (err) {
      next(err)
    }
  }

  static async lookup(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user?.userId) throw new UnauthorizedError("Authentication required")
      const query = req.query as unknown as LookupMuelleQuery
      const items = await MuelleService.lookup(req, query.puertoId)

      logsService.audit(req, {
        event: "muelles.lookup.http_ok",
        target: { entity: "Muelle" },
        meta: { returned: items.length, puertoId: query.puertoId },
        message: "Lookup muelles response sent",
      })

      res.status(200).json({ data: items, meta: null, error: null })
    } catch (err) {
      next(err)
    }
  }
}
