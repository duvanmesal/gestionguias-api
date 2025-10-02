import type { Request, Response, NextFunction } from "express"
import { verifyAccessToken, type JwtPayload } from "./jwt"
import { UnauthorizedError } from "./errors"
import { prisma } from "../prisma/client"
import type { RolType } from "@prisma/client"

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload
    }
  }
}

const SKEW_MS = 3000;

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedError("Missing or invalid authorization header")
    }

    const token = authHeader.replace("Bearer ", "")
    const payload = verifyAccessToken(token)

    if (req.clientPlatform) {
      const expectedAud = req.clientPlatform.toLowerCase()
      if (payload.aud !== expectedAud) {
        throw new UnauthorizedError("Token audience mismatch")
      }
    }

    if (payload.sid) {
      const session = await prisma.session.findUnique({
        where: { id: payload.sid },
        select: {
          id: true,
          revokedAt: true,
          refreshExpiresAt: true,
          lastRotatedAt: true,
        },
      })

      if (!session) {
        throw new UnauthorizedError("Session not found")
      }

      if (session.revokedAt) {
        throw new UnauthorizedError("Session has been revoked")
      }

      if (session.refreshExpiresAt && session.refreshExpiresAt < new Date()) {
        throw new UnauthorizedError("Session expired")
      }

      if (session.lastRotatedAt && payload.iat) {
        const tokenIatMs = payload.iat * 1000
        if (tokenIatMs + SKEW_MS < session.lastRotatedAt.getTime()) {
          throw new UnauthorizedError("Access token outdated due to refresh rotation")
        }
      }
    }

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
