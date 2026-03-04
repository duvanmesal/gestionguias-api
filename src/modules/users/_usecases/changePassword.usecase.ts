import type { Request } from "express"

import type { ChangePasswordRequest } from "../../auth/auth.schemas"

import { BusinessError, NotFoundError, UnauthorizedError } from "../../../libs/errors"
import { logger } from "../../../libs/logger"
import { logsService } from "../../../libs/logs/logs.service"
import { hashPassword, verifyPassword } from "../../../libs/password"

import { userRepository } from "../_data/user.repository"

export async function changePasswordUsecase(
  req: Request,
  id: string,
  data: ChangePasswordRequest,
  requesterId: string,
): Promise<void> {
  if (requesterId !== id) {
    throw new UnauthorizedError("You can only change your own password")
  }

  const user = await userRepository.findByIdBasic(id)
  if (!user) throw new NotFoundError("User not found")
  if (!user.activo) throw new BusinessError("Cannot change password for inactive user")

  const current = (data as any).currentPassword ?? (data as any).oldPassword
  if (!current) throw new BusinessError("currentPassword/oldPassword is required")

  if (!user.passwordHash) throw new BusinessError("User has no password set")

  const ok = await verifyPassword(current, user.passwordHash)
  if (!ok) {
    logsService.audit(req, {
      event: "user.updated",
      level: "warn",
      target: { entity: "User", id: String(id), email: user.email },
      meta: { reason: "invalid_current_password", action: "changePassword" },
      message: "Password change failed",
    })
    throw new UnauthorizedError("Current password is incorrect")
  }

  const newPasswordHash = await hashPassword((data as any).newPassword)

  const now = new Date()
  await userRepository.updatePasswordHash(id, newPasswordHash)
  await userRepository.revokeActiveSessions(id, now)

  logger.info({ userId: id }, "Password changed successfully")

  logsService.audit(req, {
    event: "user.updated",
    target: { entity: "User", id: String(id), email: user.email },
    meta: { action: "changePassword" },
    message: "Password changed",
  })
}