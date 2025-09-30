import type { Request, Response, NextFunction } from "express"
import { authService } from "./auth.service"
import { ok, created } from "../../libs/http"
import { logger } from "../../libs/logger"
import type { LoginRequest, RefreshRequest, RegisterRequest } from "./auth.schemas"

export class AuthController {
  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const data = req.body as LoginRequest
      const ip = req.ip
      const userAgent = req.get("User-Agent")

      const result = await authService.login(data, ip, userAgent)

      logger.info(
        { userId: result.user.id, email: result.user.email, ip, userAgent },
        "Login successful",
      )

      return res.json(ok(result))
    } catch (error) {
      return next(error)
    }
  }

  async refresh(req: Request, res: Response, next: NextFunction) {
    try {
      const { refreshToken } = req.body as RefreshRequest
      const ip = req.ip
      const userAgent = req.get("User-Agent")

      const result = await authService.refresh(refreshToken, ip, userAgent)
      return res.json(ok(result))
    } catch (error) {
      return next(error)
    }
  }

  async logout(req: Request, res: Response, next: NextFunction) {
    try {
      const { refreshToken } = req.body as RefreshRequest
      await authService.logout(refreshToken)
      return res.status(204).send()
    } catch (error) {
      return next(error)
    }
  }

  async logoutAll(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" })
      }
      await authService.logoutAll(req.user.userId)
      return res.status(204).send()
    } catch (error) {
      return next(error)
    }
  }

  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const data = req.body as RegisterRequest
      const result = await authService.register(data)

      logger.info(
        { userId: result.user.id, email: result.user.email, rol: result.user.rol },
        "User registration successful",
      )

      return res.status(201).json(created(result))
    } catch (error) {
      return next(error)
    }
  }

  async me(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" })
      }
      const user = await authService.getProfile(req.user.userId)
      return res.json(ok(user))
    } catch (error) {
      return next(error)
    }
  }
}

export const authController = new AuthController()
