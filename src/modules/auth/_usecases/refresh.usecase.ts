import type { Request } from "express"
import type { Platform } from "@prisma/client"

import type { RefreshResult } from "../_domain/auth.types"

import { authRepository } from "../_data/auth.repository"
import { ACCESS_TTL_SEC, REFRESH_TTL_SEC } from "../_shared/auth.ttl"

import { signAccessToken } from "../../../libs/jwt"
import { generateRefreshToken, hashRefreshToken } from "../../../libs/crypto"
import { ConflictError, UnauthorizedError } from "../../../libs/errors"
import { logger } from "../../../libs/logger"
import { logsService } from "../../../libs/logs/logs.service"

export async function refreshUsecase(
  req: Request,
  refreshToken: string,
  platform: Platform,
  ip?: string,
  userAgent?: string,
): Promise<RefreshResult> {
  const refreshTokenHash = hashRefreshToken(refreshToken)

  const session = await authRepository.findSessionByRefreshTokenHash(refreshTokenHash)

  if (!session) {
    logger.warn({ hash: refreshTokenHash }, "Refresh token not found (possible reuse)")
    logsService.audit(req, {
      event: "auth.refresh.failed",
      level: "warn",
      meta: { reason: "refresh_not_found", platform, ip, userAgent },
      message: "Refresh failed",
    })
    throw new UnauthorizedError("Invalid refresh token")
  }

  if (session.revokedAt) {
    const now = new Date()
    await authRepository.revokeAllUserSessions(session.userId, now)

    logsService.audit(req, {
      event: "auth.refresh.failed",
      level: "warn",
      target: { entity: "User", id: String(session.userId) },
      meta: { reason: "token_reuse_detected", platform, sessionId: session.id, ip, userAgent },
      message: "Refresh failed",
    })

    throw new ConflictError("Token reuse detected. All sessions have been terminated.")
  }

  if (session.refreshExpiresAt && session.refreshExpiresAt < new Date()) {
    logsService.audit(req, {
      event: "auth.refresh.failed",
      level: "warn",
      target: { entity: "User", id: String(session.userId) },
      meta: { reason: "refresh_expired", platform, sessionId: session.id, ip, userAgent },
      message: "Refresh failed",
    })
    throw new UnauthorizedError("Refresh token expired")
  }

  if (!session.user.activo) {
    logsService.audit(req, {
      event: "auth.refresh.failed",
      level: "warn",
      target: { entity: "User", id: String(session.userId), email: session.user.email },
      meta: { reason: "inactive_user", platform, sessionId: session.id, ip, userAgent },
      message: "Refresh failed",
    })
    throw new UnauthorizedError("User account is inactive")
  }

  if (session.platform !== platform) {
    logsService.audit(req, {
      event: "auth.refresh.failed",
      level: "warn",
      target: { entity: "Session", id: String(session.id) },
      meta: {
        reason: "platform_mismatch",
        expected: session.platform,
        got: platform,
        ip,
        userAgent,
      },
      message: "Refresh failed",
    })
    throw new UnauthorizedError("Platform mismatch")
  }

  const now = new Date()
  const newRefreshTokenValue = generateRefreshToken()
  const newRefreshTokenHash = hashRefreshToken(newRefreshTokenValue)
  const newRefreshExpiresAt = new Date(Date.now() + REFRESH_TTL_SEC * 1000)

  const rotated = await authRepository.rotateRefreshTokenAtomic({
    sessionId: session.id,
    oldHash: refreshTokenHash,
    newHash: newRefreshTokenHash,
    newExpiresAt: newRefreshExpiresAt,
    ip,
    userAgent,
    now,
  })

  if (rotated.count === 0) {
    await authRepository.revokeAllUserSessions(session.userId, now)
    logsService.audit(req, {
      event: "auth.refresh.failed",
      level: "warn",
      target: { entity: "User", id: String(session.userId) },
      meta: { reason: "token_reuse_race", platform, sessionId: session.id, ip, userAgent },
      message: "Refresh failed",
    })
    throw new ConflictError("Token reuse detected. All sessions have been terminated.")
  }

  const newAccessToken = signAccessToken({
    userId: session.user.id,
    email: session.user.email,
    rol: session.user.rol,
    sid: session.id,
    aud: platform.toLowerCase(),
  })

  logsService.audit(req, {
    event: "auth.refresh.success",
    target: { entity: "User", id: String(session.userId), email: session.user.email },
    meta: { platform, sessionId: session.id, ip, userAgent },
    message: "Tokens refreshed",
  })

  return {
    tokens: {
      accessToken: newAccessToken,
      accessTokenExpiresIn: ACCESS_TTL_SEC,
      refreshToken: newRefreshTokenValue,
      refreshTokenExpiresAt: newRefreshExpiresAt.toISOString(),
    },
    session: { id: session.id },
  }
}