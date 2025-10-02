import type { Request, Response, NextFunction } from "express"
import { BadRequestError } from "../libs/errors"

export type ClientPlatform = "WEB" | "MOBILE"

declare global {
  namespace Express {
    interface Request {
      clientPlatform?: ClientPlatform
    }
  }
}

/**
 * Middleware to detect and validate client platform from X-Client-Platform header
 * Required for session-aware authentication
 */
export function detectClientPlatform(req: Request, _res: Response, next: NextFunction) {
  try {
    const platformHeader = req.get("X-Client-Platform")

    if (!platformHeader) {
      throw new BadRequestError("Missing X-Client-Platform header. Must be 'web' or 'mobile'")
    }

    const normalizedPlatform = platformHeader.toLowerCase()

    if (normalizedPlatform !== "web" && normalizedPlatform !== "mobile") {
      throw new BadRequestError("Invalid X-Client-Platform header. Must be 'web' or 'mobile'")
    }

    // Normalize to uppercase for consistency with Prisma enum
    req.clientPlatform = normalizedPlatform.toUpperCase() as ClientPlatform

    next()
  } catch (error) {
    next(error)
  }
}

/**
 * Optional middleware that allows requests without platform header
 * Useful for backward compatibility or public endpoints
 */
export function optionalClientPlatform(req: Request, _res: Response, next: NextFunction) {
  const platformHeader = req.get("X-Client-Platform")

  if (platformHeader) {
    const normalizedPlatform = platformHeader.toLowerCase()
    if (normalizedPlatform === "web" || normalizedPlatform === "mobile") {
      req.clientPlatform = normalizedPlatform.toUpperCase() as ClientPlatform
    }
  }

  next()
}
