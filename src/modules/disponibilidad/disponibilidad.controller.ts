import type { Request, Response, NextFunction } from "express"
import { UnauthorizedError } from "../../libs/errors"
import { marcarDisponibilidadUsecase } from "./_usecases/marcar.usecase"
import { desmarcarDisponibilidadUsecase } from "./_usecases/desmarcar.usecase"
import { listDisponibilidadUsecase } from "./_usecases/list.usecase"
import { getMeDisponibilidadUsecase } from "./_usecases/getMe.usecase"

export class DisponibilidadController {
  static async marcar(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user?.userId) throw new UnauthorizedError("Authentication required")
      const atencionId = Number(req.params.id)
      const data = await marcarDisponibilidadUsecase(req, atencionId)
      res.status(201).json({ data, meta: null, error: null })
    } catch (err) {
      next(err)
    }
  }

  static async desmarcar(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user?.userId) throw new UnauthorizedError("Authentication required")
      const atencionId = Number(req.params.id)
      await desmarcarDisponibilidadUsecase(req, atencionId)
      res.status(200).json({ data: null, meta: null, error: null })
    } catch (err) {
      next(err)
    }
  }

  static async getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user?.userId) throw new UnauthorizedError("Authentication required")
      const atencionId = Number(req.params.id)
      const data = await getMeDisponibilidadUsecase(req, atencionId)
      res.status(200).json({ data, meta: null, error: null })
    } catch (err) {
      next(err)
    }
  }

  static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user?.userId) throw new UnauthorizedError("Authentication required")
      const atencionId = Number(req.params.id)
      const data = await listDisponibilidadUsecase(req, atencionId)
      res.status(200).json({ data, meta: null, error: null })
    } catch (err) {
      next(err)
    }
  }
}
