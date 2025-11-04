import { Request, Response, NextFunction } from "express";
import { PaisService } from "./pais.service";

export class PaisController {
  static async list(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { items, total, page, pageSize } = await PaisService.list(
        req.query as any
      );
      res
        .status(200)
        .json({ data: items, meta: { page, pageSize, total }, error: null });
      return;
    } catch (err) {
      next(err);
      return;
    }
  }

  static async get(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const id = Number(req.params.id);
      const item = await PaisService.get(id);
      if (!item) {
        res.status(404).json({
          data: null,
          meta: null,
          error: { code: "NOT_FOUND", message: "País no encontrado" },
        });
        return;
      }
      res.status(200).json({ data: item, meta: null, error: null });
      return;
    } catch (err) {
      next(err);
      return;
    }
  }

  static async create(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const item = await PaisService.create(req.body);
      res.status(201).json({ data: item, meta: null, error: null });
      return;
    } catch (err) {
      next(err);
      return;
    }
  }

  static async update(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const id = Number(req.params.id);
      const item = await PaisService.update(id, req.body);
      res.status(200).json({ data: item, meta: null, error: null });
      return;
    } catch (err) {
      next(err);
      return;
    }
  }

  static async remove(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const id = Number(req.params.id);
      const item = await PaisService.remove(id);
      res.status(200).json({ data: item, meta: null, error: null });
      return;
    } catch (err) {
      next(err);
      return;
    }
  }

  static async lookup(
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const items = await PaisService.lookup();
      res.status(200).json({ data: items, meta: null, error: null });
      return;
    } catch (err) {
      next(err);
      return;
    }
  }
}
