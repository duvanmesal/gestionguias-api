import type { Request, Response, NextFunction } from "express"
import { ForbiddenError, UnauthorizedError } from "./errors"
import { RolType } from "@prisma/client"

export const requireRoles = (...roles: RolType[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new UnauthorizedError("Authentication required")
    }

    if (!roles.includes(req.user.rol as RolType)) {
      throw new ForbiddenError(`Insufficient role. Required: ${roles.join(", ")}`)
    }

    next()
  }
}

// Convenience functions for common role checks
export const requireSuperAdmin = requireRoles(RolType.SUPER_ADMIN)
export const requireSupervisor = requireRoles(RolType.SUPER_ADMIN, RolType.SUPERVISOR)
export const requireGuia = requireRoles(RolType.SUPER_ADMIN, RolType.SUPERVISOR, RolType.GUIA)
