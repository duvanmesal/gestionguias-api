import type { Request } from "express"

import type { LogoutAllRequest } from "../auth.schemas"

import { authRepository } from "../_data/auth.repository"
import { terminateAllSessionsUsecase } from "./terminateAllSessions.usecase"

import { hashLogoutAllCode } from "../../../libs/crypto"
import { BadRequestError, UnauthorizedError } from "../../../libs/errors"
import { logsService } from "../../../libs/logs/logs.service"

export async function logoutAllUsecase(
  req: Request,
  userId: string,
  verification: LogoutAllRequest["verification"],
): Promise<void> {
  const user = await authRepository.findUserByIdForLogoutAllCode(userId)
  if (!user || !user.activo) {
    throw new UnauthorizedError("User not found or inactive")
  }

  if (verification.method !== "code") {
    throw new BadRequestError("Unsupported verification method")
  }

  const now = new Date()
  const codeHash = hashLogoutAllCode(verification.code)
  const candidate = await authRepository.getLogoutAllCodeCandidate(
    userId,
    codeHash,
  )

  if (
    !candidate ||
    !candidate.userActive ||
    candidate.usedAt ||
    candidate.expiresAt <= now
  ) {
    throw new UnauthorizedError("Invalid or expired verification code")
  }

  const consumed = await authRepository.consumeLogoutAllCode({
    codeId: candidate.codeId,
    userId,
    codeHash,
    now,
  })
  if (!consumed) {
    throw new UnauthorizedError("Invalid or expired verification code")
  }

  logsService.audit(req, {
    event: "auth.logout_all.code_confirmed",
    target: { entity: "User", id: String(user.id), email: user.email },
    meta: { platform: req.clientPlatform || "UNKNOWN" },
    message: "Logout-all verification code confirmed",
  })

  await terminateAllSessionsUsecase(req, userId)
}
