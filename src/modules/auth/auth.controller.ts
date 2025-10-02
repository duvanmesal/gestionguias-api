import type { Request, Response, NextFunction } from "express"
import { authService } from "./auth.service"
import { ok, created } from "../../libs/http"
import { logger } from "../../libs/logger"
import { BadRequestError } from "../../libs/errors"
import type { LoginRequest, RefreshRequest, RegisterRequest } from "./auth.schemas"
import type { Platform } from "@prisma/client"

export class AuthController {
  async login(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.clientPlatform) {
        throw new BadRequestError("X-Client-Platform header is required")
      }
      const REFRESH_COOKIE_PATH = (process.env.API_PREFIX || "") + "/auth/refresh"
      const data = req.body as LoginRequest
      const platform = req.clientPlatform as Platform
      const ip = req.ip
      const userAgent = req.get("User-Agent")

      const result = await authService.login(data, platform, ip, userAgent)

      logger.info({ userId: result.user.id, email: result.user.email, platform, ip, userAgent }, "Login successful")

      if (platform === "WEB" && result.tokens.refreshToken) {
        res.cookie("rt", result.tokens.refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          path: REFRESH_COOKIE_PATH,
          maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        })

        // Remove refreshToken from response body for web
        const { refreshToken, ...tokensWithoutRT } = result.tokens
        return res.json(ok({ ...result, tokens: tokensWithoutRT }))
      }

      return res.json(ok(result))
    } catch (error) {
      return next(error)
    }
  }

  async refresh(req: Request, res: Response, next: NextFunction) {
    try {
      const REFRESH_COOKIE_PATH = (process.env.API_PREFIX || "") + "/auth/refresh"
      if (!req.clientPlatform) {
        throw new BadRequestError("X-Client-Platform header is required")
      }

      const platform = req.clientPlatform as Platform
      const ip = req.ip
      const userAgent = req.get("User-Agent")

      let refreshToken: string | undefined

      if (platform === "WEB") {
        refreshToken = req.cookies?.rt
        if (!refreshToken) {
          throw new BadRequestError("Refresh token cookie not found")
        }
      } else {
        const body = req.body as RefreshRequest
        refreshToken = body.refreshToken
        if (!refreshToken) {
          throw new BadRequestError("Refresh token is required in request body for mobile")
        }
      }

      const result = await authService.refresh(refreshToken, platform, ip, userAgent)

      if (platform === "WEB" && result.tokens.refreshToken) {
        res.cookie("rt", result.tokens.refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          path: REFRESH_COOKIE_PATH,
          maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        })

        // Remove refreshToken from response body for web
        const { refreshToken: _, ...tokensWithoutRT } = result.tokens
        return res.json(ok({ ...result, tokens: tokensWithoutRT }))
      }

      return res.json(ok(result))
    } catch (error) {
      return next(error)
    }
  }

  async logout(req: Request, res: Response, next: NextFunction) {
    try {
      const REFRESH_COOKIE_PATH = (process.env.API_PREFIX || "") + "/auth/refresh"
      if (!req.user?.sid) {
        throw new BadRequestError("Session ID not found in token")
      }

      const platform = req.clientPlatform as Platform

      await authService.logout(req.user.sid)

      if (platform === "WEB") {
        res.clearCookie("rt", {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          path: "/",
        })
      }

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

      const platform = req.clientPlatform as Platform
      if (platform === "WEB") {
        res.clearCookie("rt", {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          path: "/auth/refresh",
        })
      }

      return res.status(204).send()
    } catch (error) {
      return next(error)
    }
  }

  async sessions(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" })
      }

      const sessions = await authService.listSessions(req.user.userId)
      return res.json(ok({ sessions }))
    } catch (error) {
      return next(error)
    }
  }

  async revokeSession(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" })
      }

      const { sessionId } = req.params

      if (!sessionId) {
        throw new BadRequestError("Session ID is required")
      }

      await authService.revokeSession(sessionId, req.user.userId)
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
