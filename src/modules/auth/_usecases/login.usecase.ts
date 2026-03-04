import type { Request } from "express"
import type { Platform } from "@prisma/client"

import type { LoginRequest } from "../auth.schemas"
import type { LoginResult } from "../_domain/auth.types"

import { authRepository } from "../_data/auth.repository"
import { normalizeEmail, mapUsuarioToAuthUserPublic } from "../_domain/auth.mappers"
import { ACCESS_TTL_SEC, REFRESH_TTL_SEC } from "../_shared/auth.ttl"

import { verifyPassword } from "../../../libs/password"
import { signAccessToken } from "../../../libs/jwt"
import { generateRefreshToken, hashRefreshToken } from "../../../libs/crypto"
import { BadRequestError, UnauthorizedError } from "../../../libs/errors"
import { logger } from "../../../libs/logger"
import { logsService } from "../../../libs/logs/logs.service"

export async function loginUsecase(
  req: Request,
  data: LoginRequest,
  platform: Platform,
  ip?: string,
  userAgent?: string,
): Promise<LoginResult> {
  if (platform === "MOBILE" && !data.deviceId) {
    logsService.audit(req, {
      event: "auth.login.failed",
      level: "warn",
      target: { entity: "User", email: data.email },
      meta: { reason: "missing_deviceId", platform, ip, userAgent },
      message: "Login failed",
    })
    throw new BadRequestError("deviceId is required for mobile platform")
  }

  const email = normalizeEmail(data.email)

  logger.info({ email }, "[Auth/Login] lookup by email")
  const user = await authRepository.findUserByEmailForLogin(email)

  if (!user) {
    logger.warn({ email }, "[Auth/Login] user not found")
    logsService.audit(req, {
      event: "auth.login.failed",
      level: "warn",
      target: { entity: "User", email },
      meta: { reason: "user_not_found", platform, ip, userAgent },
      message: "Login failed",
    })
    throw new UnauthorizedError("Invalid credentials")
  }

  if (!user.activo) {
    logger.warn({ userId: user.id }, "[Auth/Login] inactive user")
    logsService.audit(req, {
      event: "auth.login.failed",
      level: "warn",
      target: { entity: "User", id: String(user.id), email: user.email },
      meta: { reason: "inactive_user", platform, ip, userAgent },
      message: "Login failed",
    })
    throw new UnauthorizedError("Invalid credentials")
  }

  const isValidPassword = await verifyPassword(data.password, user.passwordHash)
  if (!isValidPassword) {
    logsService.audit(req, {
      event: "auth.login.failed",
      level: "warn",
      target: { entity: "User", id: String(user.id), email: user.email },
      meta: { reason: "invalid_credentials", platform, ip, userAgent },
      message: "Login failed",
    })
    throw new UnauthorizedError("Invalid credentials")
  }

  const refreshTokenValue = generateRefreshToken()
  const refreshTokenHash = hashRefreshToken(refreshTokenValue)
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TTL_SEC * 1000)

  const session = await authRepository.createSession({
    userId: user.id,
    platform,
    deviceId: data.deviceId || null,
    userAgent,
    ip,
    refreshTokenHash,
    refreshExpiresAt,
  })

  const accessToken = signAccessToken({
    userId: user.id,
    email: user.email,
    rol: user.rol,
    sid: session.id,
    aud: platform.toLowerCase(),
  })

  logsService.audit(req, {
    event: "auth.login.success",
    target: { entity: "User", id: String(user.id), email: user.email },
    meta: { platform, sessionId: session.id, ip, userAgent },
    message: "User logged in",
  })

  return {
    user: mapUsuarioToAuthUserPublic(user),
    tokens: {
      accessToken,
      accessTokenExpiresIn: ACCESS_TTL_SEC,
      refreshToken: refreshTokenValue,
      refreshTokenExpiresAt: refreshExpiresAt.toISOString(),
    },
    session: {
      id: session.id,
      platform: session.platform,
      createdAt: session.createdAt,
    },
  }
}