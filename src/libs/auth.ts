import type { Request, Response, NextFunction } from "express"
import { verifyAccessToken, type JwtPayload } from "./jwt"
import { UnauthorizedError } from "./errors"
import type { RolType } from "@prisma/client"

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedError("Missing or invalid authorization header")
    }

    const token = authHeader.replace("Bearer ", "")

    if (!token) {
      throw new UnauthorizedError("Missing token")
    }

    const payload = verifyAccessToken(token)
    req.user = payload

    next()
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      next(error)
    } else {
      next(new UnauthorizedError("Invalid or expired token"))
    }
  }
}

export function requireOwnershipOrRole(roles: RolType[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new UnauthorizedError("Authentication required")
    }

    const userId = req.params.id || req.params.userId
    const isOwner = req.user.userId === userId
    const hasRole = roles.includes(req.user.rol as RolType)

    if (!isOwner && !hasRole) {
      throw new UnauthorizedError("Access denied: insufficient permissions")
    }

    next()
  }
}
