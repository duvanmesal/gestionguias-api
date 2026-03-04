import type { Request } from "express"

import { authRepository } from "../_data/auth.repository"
import { terminateAllSessionsUsecase } from "./terminateAllSessions.usecase"

import { hashPassword, verifyPassword } from "../../../libs/password"
import { hashPasswordResetToken } from "../../../libs/crypto"
import { BadRequestError } from "../../../libs/errors"
import { logger } from "../../../libs/logger"
import { logsService } from "../../../libs/logs/logs.service"

export async function resetPasswordUsecase(
  req: Request,
  token: string,
  newPassword: string,
): Promise<void> {
  const raw = token.trim()
  if (!raw) throw new BadRequestError("Invalid or expired token")

  const now = new Date()
  const tokenHash = hashPasswordResetToken(raw)

  const candidate = await authRepository.getPasswordResetCandidate(tokenHash, now)
  if (!candidate || !candidate.userActive) {
    throw new BadRequestError("Invalid or expired token")
  }

  const isSame = await verifyPassword(newPassword, candidate.currentPasswordHash)
  if (isSame) {
    throw new BadRequestError("New password must be different from current password")
  }

  const newHash = await hashPassword(newPassword)

  const applied = await authRepository.applyPasswordReset({
    tokenId: candidate.tokenId,
    tokenHash,
    userId: candidate.userId,
    newPasswordHash: newHash,
    now,
  })

  if (!applied) {
    throw new BadRequestError("Invalid or expired token")
  }

  await terminateAllSessionsUsecase(req, candidate.userId, { reason: "password_reset" })

  logsService.audit(req, {
    event: "auth.password_reset.completed",
    target: { entity: "User", id: String(candidate.userId) },
    message: "Password reset completed",
  })

  logger.info(
    { userId: candidate.userId },
    "[Auth/ResetPassword] password updated and sessions revoked",
  )
}