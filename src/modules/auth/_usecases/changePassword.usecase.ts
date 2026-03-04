import type { Request } from "express"

import { authRepository } from "../_data/auth.repository"
import { terminateAllSessionsUsecase } from "./terminateAllSessions.usecase"

import { hashPassword, verifyPassword } from "../../../libs/password"
import { BadRequestError, NotFoundError, UnauthorizedError } from "../../../libs/errors"
import { logger } from "../../../libs/logger"
import { logsService } from "../../../libs/logs/logs.service"

export async function changePasswordUsecase(
  req: Request,
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const user = await authRepository.findUserByIdForPasswordCheck(userId)
  if (!user) throw new NotFoundError("User not found")
  if (!user.activo) throw new UnauthorizedError("User account is inactive")

  const okPass = await verifyPassword(currentPassword, user.passwordHash)
  if (!okPass) {
    logsService.audit(req, {
      event: "auth.password_change.failed",
      level: "warn",
      target: { entity: "User", id: String(userId), email: user.email },
      meta: { reason: "invalid_current_password" },
      message: "Change password failed",
    })
    throw new UnauthorizedError("Invalid current password")
  }

  const isSame = await verifyPassword(newPassword, user.passwordHash)
  if (isSame) {
    logsService.audit(req, {
      event: "auth.password_change.failed",
      level: "warn",
      target: { entity: "User", id: String(userId), email: user.email },
      meta: { reason: "same_password" },
      message: "Change password failed",
    })
    throw new BadRequestError("New password must be different from current password")
  }

  const newHash = await hashPassword(newPassword)
  await authRepository.updateUserPasswordHash(userId, newHash)

  await terminateAllSessionsUsecase(req, userId, { reason: "password_change" })

  logsService.audit(req, {
    event: "auth.password_change.completed",
    target: { entity: "User", id: String(userId), email: user.email },
    message: "Password changed",
  })

  logger.info({ userId }, "Password changed successfully")
}