import type { Request, Response, NextFunction } from "express"
import { logsService } from "../../libs/logs/logs.service"
import { PaisService } from "./pais.service"

export class PaisController {
  static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await PaisService.list(req.query as any)

      logsService.audit(req, {
        event: "paises.list.http_ok",
        target: { entity: "Pais" },
        meta: { returned: result.items.length, ...result.meta },
        message: "List paises response sent",
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
      const id = Number(req.params.id)
      const item = await PaisService.get(id)

      logsService.audit(req, {
        event: "paises.get.http_ok",
        target: { entity: "Pais", id: String(id) },
        meta: { id },
        message: "Get pais response sent",
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
      const item = await PaisService.create(req.body)

      logsService.audit(req, {
        event: "paises.create.http_ok",
        target: { entity: "Pais", id: String(item.id) },
        meta: { id: item.id, codigo: item.codigo, nombre: item.nombre },
        message: "Create pais response sent",
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
      const id = Number(req.params.id)
      const item = await PaisService.update(id, req.body)

      logsService.audit(req, {
        event: "paises.update.http_ok",
        target: { entity: "Pais", id: String(id) },
        meta: { id },
        message: "Update pais response sent",
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
      const id = Number(req.params.id)
      const item = await PaisService.remove(id)

      logsService.audit(req, {
        event: "paises.remove.http_ok",
        target: { entity: "Pais", id: String(id) },
        meta: { id },
        message: "Remove pais response sent",
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
      const items = await PaisService.lookup()

      logsService.audit(req, {
        event: "paises.lookup.http_ok",
        target: { entity: "Pais" },
        meta: { returned: items.length },
        message: "Lookup paises response sent",
      })

      res.status(200).json({ data: items, meta: null, error: null })
      return
    } catch (err) {
      next(err)
      return
    }
  }
}