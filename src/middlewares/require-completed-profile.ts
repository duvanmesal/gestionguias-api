import type { Request, Response, NextFunction } from "express"
import { prisma } from "../prisma/client"
import { UnauthorizedError } from "../libs/errors"
import { logger } from "../libs/logger"

// Routes that don't require a completed profile
const WHITELIST_PATHS = [
  "/api/v1/auth/login",
  "/api/v1/auth/refresh",
  "/api/v1/auth/logout",
  "/api/v1/auth/me",
  "/api/v1/users/me/profile",
  "/health",
]

// Check if the current path is whitelisted
function isWhitelisted(path: string): boolean {
  return WHITELIST_PATHS.some((whitelistedPath) => path.startsWith(whitelistedPath))
}

export async function requireCompletedProfile(req: Request, res: Response, next: NextFunction) {
  try {
    // Skip check for whitelisted routes
    if (isWhitelisted(req.path)) {
      return next()
    }

    // Skip check if no user is authenticated
    if (!req.user) {
      return next()
    }

    // Get user's profile status
    const user = await prisma.usuario.findUnique({
      where: { id: req.user.userId },
      select: {
        id: true,
        profileStatus: true,
        email: true,
      },
    })

    if (!user) {
      throw new UnauthorizedError("User not found")
    }

    // If profile is incomplete, block access
    if (user.profileStatus === "INCOMPLETE") {
      logger.warn(
        {
          userId: user.id,
          email: user.email,
          attemptedPath: req.path,
        },
        "Access denied: profile incomplete",
      )

      return res.status(409).json({
        data: null,
        meta: null,
        error: {
          code: "PROFILE_INCOMPLETE",
          message: "You must complete your profile before accessing this resource",
          details: {
            requiredAction: "complete_profile",
            endpoint: "/api/v1/users/me/profile",
          },
        },
      })
    }

    next()
  } catch (error) {
    next(error)
  }
}
