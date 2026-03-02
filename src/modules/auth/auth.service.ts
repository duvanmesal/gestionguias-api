import type { Request } from "express"
import { prisma } from "../../prisma/client"
import { hashPassword, verifyPassword } from "../../libs/password"
import { signAccessToken } from "../../libs/jwt"
import {
  generateRefreshToken,
  hashRefreshToken,
  generatePasswordResetToken,
  hashPasswordResetToken,
  generateEmailVerifyToken,
  hashEmailVerifyToken,
} from "../../libs/crypto"
import {
  UnauthorizedError,
  ConflictError,
  NotFoundError,
  BadRequestError,
} from "../../libs/errors"
import { logger } from "../../libs/logger"
import { parseTtlToSeconds } from "../../libs/time"
import type { LoginRequest, RegisterRequest } from "./auth.schemas"
import type { RolType, Platform } from "@prisma/client"
import { sendPasswordResetEmail, sendVerifyEmailEmail } from "../../libs/email"
import { env } from "../../config/env"

// logs facade
import { logsService } from "../../libs/logs/logs.service"

// TTLs leídos del .env (con fallback)
const ACCESS_TTL_SEC = parseTtlToSeconds(env.JWT_ACCESS_TTL, 900) // 15m por defecto
const REFRESH_TTL_SEC = parseTtlToSeconds(env.JWT_REFRESH_TTL, 60 * 60 * 24 * 30) // 30d por defecto

export interface LoginResult {
  user: {
    id: string
    email: string
    nombres: string
    apellidos: string
    rol: RolType
    activo: boolean
    emailVerifiedAt: string | null
    createdAt: string
    updatedAt: string
    telefono?: string | null
    documentType?: string | null
    documentNumber?: string | null
  }
  tokens: {
    accessToken: string
    accessTokenExpiresIn: number
    refreshToken?: string
    refreshTokenExpiresAt: string
  }
  session: {
    id: string
    platform: Platform
    createdAt: Date
  }
}

export interface RefreshResult {
  tokens: {
    accessToken: string
    accessTokenExpiresIn: number
    refreshToken?: string
    refreshTokenExpiresAt: string
  }
  session: {
    id: string
  }
}

export interface SessionInfo {
  id: string
  platform: Platform
  deviceId: string | null
  ip: string | null
  userAgent: string | null
  createdAt: Date
  lastRotatedAt: Date | null
}

export class AuthService {
  async login(
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

    logger.info({ email: data.email }, "[Auth/Login] lookup by email")
    const user = await prisma.usuario.findUnique({
      where: { email: data.email },
    })

    if (!user) {
      logger.warn({ email: data.email }, "[Auth/Login] user not found")
      logsService.audit(req, {
        event: "auth.login.failed",
        level: "warn",
        target: { entity: "User", email: data.email },
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
    if (!user.passwordHash) {
      logger.error({ userId: user.id }, "[Auth/Login] missing passwordHash")
      logsService.audit(req, {
        event: "auth.login.failed",
        level: "warn",
        target: { entity: "User", id: String(user.id), email: user.email },
        meta: { reason: "missing_passwordHash", platform, ip, userAgent },
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

    logger.info(
      { userId: user.id, email: user.email, platform, ip, userAgent },
      "[Auth/Login] success",
    )

    const refreshTokenValue = generateRefreshToken()
    const refreshTokenHash = hashRefreshToken(refreshTokenValue)
    const refreshExpiresAt = new Date(Date.now() + REFRESH_TTL_SEC * 1000)

    const session = await prisma.session.create({
      data: {
        userId: user.id,
        platform,
        deviceId: data.deviceId || null,
        userAgent,
        ip,
        refreshTokenHash,
        refreshExpiresAt,
      },
    })

    const accessToken = signAccessToken({
      userId: user.id,
      email: user.email,
      rol: user.rol,
      sid: session.id,
      aud: platform.toLowerCase(),
    })

    // ✅ audit success
    logsService.audit(req, {
      event: "auth.login.success",
      target: { entity: "User", id: String(user.id), email: user.email },
      meta: { platform, sessionId: session.id, ip, userAgent },
      message: "User logged in",
    })

    logger.info(
      { userId: user.id, email: user.email, platform, sessionId: session.id },
      "User logged in successfully",
    )

    return {
      user: {
        id: user.id,
        email: user.email,
        nombres: user.nombres,
        apellidos: user.apellidos,
        rol: user.rol,
        activo: user.activo,

        emailVerifiedAt: user.emailVerifiedAt ? user.emailVerifiedAt.toISOString() : null,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      },
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

  async refresh(
    req: Request,
    refreshToken: string,
    platform: Platform,
    ip?: string,
    userAgent?: string,
  ): Promise<RefreshResult> {
    const refreshTokenHash = hashRefreshToken(refreshToken)

    const session = await prisma.session.findUnique({
      where: { refreshTokenHash },
      include: { user: true },
    })

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
      await this.revokeAllUserSessions(session.userId)
      logger.warn(
        { userId: session.userId, sessionId: session.id },
        "Token reuse detected - all sessions revoked",
      )
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

    const newRefreshTokenValue = generateRefreshToken()
    const newRefreshTokenHash = hashRefreshToken(newRefreshTokenValue)
    const newRefreshExpiresAt = new Date(Date.now() + REFRESH_TTL_SEC * 1000)

    const rotated = await prisma.session.updateMany({
      where: { id: session.id, refreshTokenHash },
      data: {
        refreshTokenHash: newRefreshTokenHash,
        refreshExpiresAt: newRefreshExpiresAt,
        lastRotatedAt: new Date(),
        ip,
        userAgent,
      },
    })

    if (rotated.count === 0) {
      await this.revokeAllUserSessions(session.userId)
      logger.warn(
        { userId: session.userId, sessionId: session.id },
        "Refresh token reuse detected (race) - all sessions revoked",
      )
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

    // ✅ audit success
    logsService.audit(req, {
      event: "auth.refresh.success",
      target: { entity: "User", id: String(session.userId), email: session.user.email },
      meta: { platform, sessionId: session.id, ip, userAgent },
      message: "Tokens refreshed",
    })

    logger.info({ userId: session.userId, sessionId: session.id }, "Tokens refreshed successfully")

    return {
      tokens: {
        accessToken: newAccessToken,
        accessTokenExpiresIn: ACCESS_TTL_SEC,
        refreshToken: newRefreshTokenValue,
        refreshTokenExpiresAt: newRefreshExpiresAt.toISOString(),
      },
      session: {
        id: session.id,
      },
    }
  }

  async logout(req: Request, sessionId: string): Promise<void> {
    const session = await prisma.session.findUnique({ where: { id: sessionId } })
    if (session && !session.revokedAt) {
      await prisma.session.update({
        where: { id: sessionId },
        data: { revokedAt: new Date() },
      })

      logsService.audit(req, {
        event: "auth.logout",
        target: { entity: "Session", id: String(sessionId) },
        meta: { scope: "single", userId: String(session.userId) },
        message: "Session logged out",
      })

      logger.info({ userId: session.userId, sessionId }, "Session logged out successfully")
    }
  }

  async logoutAll(req: Request, userId: string): Promise<void> {
    const now = new Date()
    await prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now, lastRotatedAt: now },
    })

    logsService.audit(req, {
      event: "auth.logout",
      target: { entity: "User", id: String(userId) },
      meta: { scope: "all" },
      message: "All sessions terminated",
    })

    logger.info({ userId }, "All user sessions terminated")
  }

  async listSessions(userId: string): Promise<SessionInfo[]> {
    const sessions = await prisma.session.findMany({
      where: {
        userId,
        revokedAt: null,
        refreshExpiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        platform: true,
        deviceId: true,
        ip: true,
        userAgent: true,
        createdAt: true,
        lastRotatedAt: true,
      },
      orderBy: { createdAt: "desc" },
    })
    return sessions
  }

  async revokeSession(sessionId: string, userId: string): Promise<void> {
    const session = await prisma.session.findFirst({
      where: { id: sessionId, userId },
    })
    if (!session) throw new NotFoundError("Session not found")
    if (session.revokedAt) throw new BadRequestError("Session already revoked")

    await prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    })
    logger.info({ userId, sessionId }, "Session revoked by user")
  }

  async register(
    data: RegisterRequest,
  ): Promise<{
    user: { id: string; email: string; nombres: string; apellidos: string; rol: RolType }
  }> {
    const existingUser = await prisma.usuario.findUnique({
      where: { email: data.email },
    })
    if (existingUser) throw new ConflictError("User with this email already exists")

    const passwordHash = await hashPassword(data.password)
    const user = await prisma.usuario.create({
      data: {
        email: data.email,
        passwordHash,
        nombres: data.nombres,
        apellidos: data.apellidos,
        rol: data.rol,
        activo: true,
      },
    })

    logger.info({ userId: user.id, email: user.email, rol: user.rol }, "New user registered")

    return {
      user: {
        id: user.id,
        email: user.email,
        nombres: user.nombres,
        apellidos: user.apellidos,
        rol: user.rol,
      },
    }
  }

  async getProfile(userId: string) {
    const user = await prisma.usuario.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        nombres: true,
        apellidos: true,
        rol: true,
        activo: true,
        createdAt: true,
        updatedAt: true,
        emailVerifiedAt: true,
      },
    })
    if (!user) throw new NotFoundError("User not found")

    return {
      ...user,
      emailVerifiedAt: user.emailVerifiedAt ? user.emailVerifiedAt.toISOString() : null,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    }
  }

  async forgotPassword(req: Request, email: string): Promise<void> {
    const normalizedEmail = email.trim().toLowerCase()

    const user = await prisma.usuario.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email: true, activo: true },
    })

    // ✅ audit requested (siempre, incluso si es no-op)
    logsService.audit(req, {
      event: "auth.password_reset.requested",
      target: { entity: "User", email: normalizedEmail },
      meta: { found: !!user, active: !!user?.activo },
      message: "Password reset requested",
    })

    // Silencioso para evitar enumeración
    if (!user || !user.activo) {
      logger.info({ email: normalizedEmail, found: !!user }, "[Auth/ForgotPassword] no-op")
      return
    }

    const ttlMinutes = env.PASSWORD_RESET_TTL_MINUTES
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000)

    const token = generatePasswordResetToken()
    const tokenHash = hashPasswordResetToken(token)

    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    })

    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    })

    const resetUrl = `${env.APP_RESET_PASSWORD_URL}?token=${encodeURIComponent(token)}`

    await sendPasswordResetEmail({
      to: user.email,
      resetUrl,
      ttlMinutes,
    })

    logger.info({ userId: user.id, expiresAt }, "[Auth/ForgotPassword] reset email sent")
  }

  async resetPassword(req: Request, token: string, newPassword: string): Promise<void> {
    const raw = token.trim()
    if (!raw) throw new BadRequestError("Invalid or expired token")

    const tokenHash = hashPasswordResetToken(raw)
    const now = new Date()

    let resolvedUserId = ""

    await prisma.$transaction(async (tx) => {
      const prt = await tx.passwordResetToken.findFirst({
        where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
        select: { id: true, userId: true },
      })

      if (!prt) {
        throw new BadRequestError("Invalid or expired token")
      }

      const user = await tx.usuario.findUnique({
        where: { id: prt.userId },
        select: { id: true, activo: true, passwordHash: true, email: true },
      })

      if (!user || !user.activo) {
        throw new BadRequestError("Invalid or expired token")
      }

      if (user.passwordHash) {
        const isSame = await verifyPassword(newPassword, user.passwordHash)
        if (isSame) {
          throw new BadRequestError("New password must be different from current password")
        }
      }

      const newHash = await hashPassword(newPassword)

      await tx.usuario.update({
        where: { id: user.id },
        data: { passwordHash: newHash },
      })

      await tx.passwordResetToken.update({
        where: { id: prt.id },
        data: { usedAt: now },
      })

      await tx.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      })

      resolvedUserId = user.id
    })

    await this.logoutAll(req, resolvedUserId)

    // ✅ audit completed
    logsService.audit(req, {
      event: "auth.password_reset.completed",
      target: { entity: "User", id: String(resolvedUserId) },
      message: "Password reset completed",
    })

    logger.info(
      { userId: resolvedUserId },
      "[Auth/ResetPassword] password updated and sessions revoked",
    )
  }

  async verifyEmailRequest(req: Request, email: string): Promise<void> {
    const normalizedEmail = email.trim().toLowerCase()

    const user = await prisma.usuario.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email: true, activo: true, emailVerifiedAt: true },
    })

    // ✅ audit requested (siempre)
    logsService.audit(req, {
      event: "auth.verify_email.requested",
      target: { entity: "User", email: normalizedEmail },
      meta: { found: !!user, active: !!user?.activo },
      message: "Verify email requested",
    })

    if (!user || !user.activo) {
      logger.info({ email: normalizedEmail, found: !!user }, "[Auth/VerifyEmailRequest] no-op")
      return
    }

    if (user.emailVerifiedAt) {
      logger.info({ userId: user.id }, "[Auth/VerifyEmailRequest] already verified (no-op)")
      logsService.audit(req, {
        event: "auth.verify_email.already_verified",
        target: { entity: "User", id: String(user.id), email: user.email },
        message: "Email already verified",
      })
      return
    }

    const ttlMinutes = env.EMAIL_VERIFY_TTL_MINUTES
    const now = new Date()
    const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000)

    const token = generateEmailVerifyToken()
    const tokenHash = hashEmailVerifyToken(token)

    await prisma.emailVerificationToken.updateMany({
      where: { userId: user.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    })

    await prisma.emailVerificationToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    })

    const verifyUrl = `${env.APP_VERIFY_EMAIL_URL}?token=${encodeURIComponent(token)}`

    await sendVerifyEmailEmail({
      to: user.email,
      verifyUrl,
      ttlMinutes,
    })

    // ✅ audit sent
    logsService.audit(req, {
      event: "auth.verify_email.sent",
      target: { entity: "User", id: String(user.id), email: user.email },
      meta: { expiresAt: expiresAt.toISOString() },
      message: "Verification email sent",
    })

    logger.info({ userId: user.id, expiresAt }, "[Auth/VerifyEmailRequest] verification email sent")
  }

  async verifyEmailConfirm(req: Request, token: string): Promise<{ message: string }> {
    const now = new Date()
    const raw = token.trim()
    if (!raw) throw new BadRequestError("Invalid or expired token")

    const tokenHash = hashEmailVerifyToken(raw)

    const record = await prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        usedAt: true,
        user: {
          select: { id: true, activo: true, emailVerifiedAt: true, email: true },
        },
      },
    })

    if (!record) throw new BadRequestError("Invalid or expired token")
    if (record.usedAt || record.expiresAt <= now) throw new BadRequestError("Invalid or expired token")
    if (!record.user || !record.user.activo) throw new BadRequestError("Invalid or expired token")

    await prisma.$transaction(async (tx) => {
      if (!record.user?.emailVerifiedAt) {
        await tx.usuario.update({
          where: { id: record.userId },
          data: { emailVerifiedAt: now },
        })
      }

      await tx.emailVerificationToken.update({
        where: { id: record.id },
        data: { usedAt: now },
      })

      await tx.emailVerificationToken.updateMany({
        where: {
          userId: record.userId,
          usedAt: null,
          expiresAt: { gt: now },
          NOT: { id: record.id },
        },
        data: { usedAt: now },
      })
    })

    // ✅ audit confirmed
    logsService.audit(req, {
      event: "auth.verify_email.confirmed",
      target: { entity: "User", id: String(record.userId), email: record.user?.email },
      message: "Email verified",
    })

    logger.info({ userId: record.userId }, "[Auth/VerifyEmailConfirm] email verified successfully")

    return { message: "Email verified successfully" }
  }

  async changePassword(
    req: Request,
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await prisma.usuario.findUnique({ where: { id: userId } })
    if (!user) throw new NotFoundError("User not found")
    if (!user.activo) throw new UnauthorizedError("User account is inactive")
    if (!user.passwordHash) throw new UnauthorizedError("User has no password set")

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

    await prisma.usuario.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    })

    await this.logoutAll(req, userId)

    logsService.audit(req, {
      event: "auth.password_change.completed",
      target: { entity: "User", id: String(userId), email: user.email },
      message: "Password changed",
    })

    logger.info({ userId }, "Password changed successfully")
  }

  private async revokeAllUserSessions(userId: string): Promise<void> {
    await prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    })
  }
}

export const authService = new AuthService()