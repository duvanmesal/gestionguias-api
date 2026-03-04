import type { Request } from "express"

import { authRepository } from "../_data/auth.repository"
import { normalizeEmail } from "../_domain/auth.mappers"

import { generatePasswordResetToken, hashPasswordResetToken } from "../../../libs/crypto"
import { sendPasswordResetEmail } from "../../../libs/email"
import { logger } from "../../../libs/logger"
import { logsService } from "../../../libs/logs/logs.service"
import { env } from "../../../config/env"

export async function forgotPasswordUsecase(req: Request, email: string): Promise<void> {
  const normalizedEmail = normalizeEmail(email)

  const user = await authRepository.findUserByEmailMinimal(normalizedEmail)

  logsService.audit(req, {
    event: "auth.password_reset.requested",
    target: { entity: "User", email: normalizedEmail },
    meta: { found: !!user, active: !!user?.activo },
    message: "Password reset requested",
  })

  if (!user || !user.activo) {
    logger.info({ email: normalizedEmail, found: !!user }, "[Auth/ForgotPassword] no-op")
    return
  }

  const ttlMinutes = env.PASSWORD_RESET_TTL_MINUTES
  const now = new Date()
  const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000)

  const token = generatePasswordResetToken()
  const tokenHash = hashPasswordResetToken(token)

  await authRepository.invalidateActivePasswordResetTokens(user.id, now)
  await authRepository.createPasswordResetToken({ userId: user.id, tokenHash, expiresAt })

  const resetUrl = `${env.APP_RESET_PASSWORD_URL}?token=${encodeURIComponent(token)}`

  await sendPasswordResetEmail({
    to: user.email,
    resetUrl,
    ttlMinutes,
  })

  logger.info({ userId: user.id, expiresAt }, "[Auth/ForgotPassword] reset email sent")
}