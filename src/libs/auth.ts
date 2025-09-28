import type { Request, Response, NextFunction } from "express"
import { verifyAccess, type JwtPayload } from "./jwt"
import { UnauthorizedError } from "./errors"

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

    const payload = verifyAccess(token)
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
