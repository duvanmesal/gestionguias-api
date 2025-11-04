import { Request, Response, NextFunction } from "express";
import { BuqueService } from "./buque.service";

export class BuqueController {
  static async list(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { items, total, page, pageSize } = await BuqueService.list(
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
      const item = await BuqueService.get(id);
      if (!item) {
        res.status(404).json({
          data: null,
          meta: null,
          error: { code: "NOT_FOUND", message: "Buque no encontrado" },
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
      const item = await BuqueService.create(req.body);
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
      const item = await BuqueService.update(id, req.body);
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
      const item = await BuqueService.remove(id);
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
      const items = await BuqueService.lookup();
      res.status(200).json({ data: items, meta: null, error: null });
      return;
    } catch (err) {
      next(err);
      return;
    }
  }
}
