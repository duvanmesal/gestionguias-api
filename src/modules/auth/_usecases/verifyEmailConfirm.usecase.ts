import type { Request } from "express"

import { authRepository } from "../_data/auth.repository"

import { hashEmailVerifyToken } from "../../../libs/crypto"
import { BadRequestError } from "../../../libs/errors"
import { logger } from "../../../libs/logger"
import { logsService } from "../../../libs/logs/logs.service"

export async function verifyEmailConfirmUsecase(
  req: Request,
  token: string,
): Promise<{ message: string }> {
  const now = new Date()
  const raw = token.trim()
  if (!raw) throw new BadRequestError("Invalid or expired token")

  const tokenHash = hashEmailVerifyToken(raw)

  const candidate = await authRepository.getEmailVerifyCandidate(tokenHash, now)

  if (!candidate) throw new BadRequestError("Invalid or expired token")
  if (candidate.usedAt || candidate.expiresAt <= now) throw new BadRequestError("Invalid or expired token")
  if (!candidate.userActive) throw new BadRequestError("Invalid or expired token")

  const applied = await authRepository.applyEmailVerification({
    tokenHash,
    tokenId: candidate.tokenId,
    userId: candidate.userId,
    now,
  })

  if (!applied) throw new BadRequestError("Invalid or expired token")

  logsService.audit(req, {
    event: "auth.verify_email.confirmed",
    target: { entity: "User", id: String(candidate.userId), email: candidate.userEmail },
    message: "Email verified",
  })

  logger.info({ userId: candidate.userId }, "[Auth/VerifyEmailConfirm] email verified successfully")

  return { message: "Email verified successfully" }
}