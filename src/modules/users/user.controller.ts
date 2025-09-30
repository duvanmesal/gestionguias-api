import type { Request, Response, NextFunction } from "express"
import { userService } from "./user.service"
import { ok, created } from "../../libs/http"
import { logger } from "../../libs/logger"
import type { CreateUserRequest, UpdateUserRequest, ChangePasswordRequest } from "../auth/auth.schemas"
import type { RolType } from "@prisma/client"

export class UserController {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const { page = "1", pageSize = "20", search, rol, activo } = req.query

      const options = {
        page: Number.parseInt(page as string, 10),
        pageSize: Number.parseInt(pageSize as string, 10),
        search: search as string,
        rol: rol as RolType,
        activo: activo === "true" ? true : activo === "false" ? false : undefined,
      }

      const result = await userService.list(options)

      res.json(ok(result.data, result.meta))
    } catch (error) {
      next(error)
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const data = req.body as CreateUserRequest
      const createdBy = req.user!.userId

      const user = await userService.create(data, createdBy)

      logger.info(
        {
          userId: user.id,
          email: user.email,
          rol: user.rol,
          createdBy,
        },
        "User created successfully",
      )

      res.status(201).json(created(user))
    } catch (error) {
      next(error)
    }
  }

  async get(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params

      const user = await userService.get(id)

      res.json(ok(user))
    } catch (error) {
      next(error)
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params
      const data = req.body as UpdateUserRequest
      const updatedBy = req.user!.userId
      const updaterRole = req.user!.rol as RolType

      const user = await userService.update(id, data, updatedBy, updaterRole)

      logger.info(
        {
          userId: id,
          updatedBy,
          changes: Object.keys(data),
        },
        "User updated successfully",
      )

      res.json(ok(user))
    } catch (error) {
      next(error)
    }
  }

  async changePassword(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params
      const data = req.body as ChangePasswordRequest
      const requesterId = req.user!.userId

      await userService.changePassword(id, data, requesterId)

      res.status(204).send()
    } catch (error) {
      next(error)
    }
  }

  async deactivate(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params
      const deactivatedBy = req.user!.userId

      await userService.deactivate(id, deactivatedBy)

      res.status(204).send()
    } catch (error) {
      next(error)
    }
  }

  async activate(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params
      const activatedBy = req.user!.userId

      await userService.activate(id, activatedBy)

      res.status(204).send()
    } catch (error) {
      next(error)
    }
  }
}

export const userController = new UserController()
