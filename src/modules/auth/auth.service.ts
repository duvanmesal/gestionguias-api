import { prisma } from "../../prisma/client"
import { hashPassword, verifyPassword } from "../../libs/password"
import { signAccessToken } from "../../libs/jwt"
import {
  generateRefreshToken,
  hashRefreshToken,
  generatePasswordResetToken,
  hashPasswordResetToken,
} from "../../libs/crypto"
import { UnauthorizedError, ConflictError, NotFoundError, BadRequestError } from "../../libs/errors"
import { logger } from "../../libs/logger"
import { parseTtlToSeconds } from "../../libs/time"
import type { LoginRequest, RegisterRequest } from "./auth.schemas"
import type { RolType, Platform } from "@prisma/client"
import { sendPasswordResetEmail } from "../../libs/email"
import { env } from "../../config/env"

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
  async login(data: LoginRequest, platform: Platform, ip?: string, userAgent?: string): Promise<LoginResult> {
    if (platform === "MOBILE" && !data.deviceId) {
      throw new BadRequestError("deviceId is required for mobile platform")
    }

    logger.info({ email: data.email }, "[Auth/Login] lookup by email")
    const user = await prisma.usuario.findUnique({ where: { email: data.email } })

    if (!user) {
      logger.warn({ email: data.email }, "[Auth/Login] user not found")
      throw new UnauthorizedError("Invalid credentials")
    }
    if (!user.activo) {
      logger.warn({ userId: user.id }, "[Auth/Login] inactive user")
      throw new UnauthorizedError("Invalid credentials")
    }
    if (!user.passwordHash) {
      logger.error({ userId: user.id }, "[Auth/Login] missing passwordHash")
      throw new UnauthorizedError("Invalid credentials")
    }

    const isValidPassword = await verifyPassword(data.password, user.passwordHash)
    if (!isValidPassword) {
      throw new UnauthorizedError("Invalid credentials")
    }

    logger.info({ userId: user.id, email: user.email, platform, ip, userAgent }, "[Auth/Login] success")

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

    logger.info({ userId: user.id, email: user.email, platform, sessionId: session.id }, "User logged in successfully")

    return {
      user: {
        id: user.id,
        email: user.email,
        nombres: user.nombres,
        apellidos: user.apellidos,
        rol: user.rol,
        activo: user.activo,
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

  async refresh(refreshToken: string, platform: Platform, ip?: string, userAgent?: string): Promise<RefreshResult> {
    const refreshTokenHash = hashRefreshToken(refreshToken)

    const session = await prisma.session.findUnique({
      where: { refreshTokenHash },
      include: { user: true },
    })

    if (!session) {
      logger.warn({ hash: refreshTokenHash }, "Refresh token not found (possible reuse)")
      throw new UnauthorizedError("Invalid refresh token")
    }

    if (session.revokedAt) {
      await this.revokeAllUserSessions(session.userId)
      logger.warn({ userId: session.userId, sessionId: session.id }, "Token reuse detected - all sessions revoked")
      throw new ConflictError("Token reuse detected. All sessions have been terminated.")
    }

    if (session.refreshExpiresAt && session.refreshExpiresAt < new Date()) {
      throw new UnauthorizedError("Refresh token expired")
    }

    if (!session.user.activo) {
      throw new UnauthorizedError("User account is inactive")
    }

    if (session.platform !== platform) {
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
      logger.warn({ userId: session.userId, sessionId: session.id }, "Refresh token reuse detected (race) - all sessions revoked")
      throw new ConflictError("Token reuse detected. All sessions have been terminated.")
    }

    const newAccessToken = signAccessToken({
      userId: session.user.id,
      email: session.user.email,
      rol: session.user.rol,
      sid: session.id,
      aud: platform.toLowerCase(),
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

  async logout(sessionId: string): Promise<void> {
    const session = await prisma.session.findUnique({ where: { id: sessionId } })
    if (session && !session.revokedAt) {
      await prisma.session.update({
        where: { id: sessionId },
        data: { revokedAt: new Date() },
      })
      logger.info({ userId: session.userId, sessionId }, "Session logged out successfully")
    }
  }

  async logoutAll(userId: string): Promise<void> {
    const now = new Date()
    await prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now, lastRotatedAt: now },
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
    const session = await prisma.session.findFirst({ where: { id: sessionId, userId } })
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
  ): Promise<{ user: { id: string; email: string; nombres: string; apellidos: string; rol: RolType } }> {
    const existingUser = await prisma.usuario.findUnique({ where: { email: data.email } })
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
      user: { id: user.id, email: user.email, nombres: user.nombres, apellidos: user.apellidos, rol: user.rol },
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
      },
    })
    if (!user) throw new NotFoundError("User not found")
    return user
  }

  // ✅ forgot-password (completo)
  async forgotPassword(email: string): Promise<void> {
    const normalizedEmail = email.trim().toLowerCase()

    const user = await prisma.usuario.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email: true, activo: true },
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

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await prisma.usuario.findUnique({ where: { id: userId } })
    if (!user) throw new NotFoundError("User not found")
    if (!user.activo) throw new UnauthorizedError("User account is inactive")
    if (!user.passwordHash) throw new UnauthorizedError("User has no password set")

    const okPass = await verifyPassword(currentPassword, user.passwordHash)
    if (!okPass) throw new UnauthorizedError("Invalid current password")

    const isSame = await verifyPassword(newPassword, user.passwordHash)
    if (isSame) throw new BadRequestError("New password must be different from current password")

    const newHash = await hashPassword(newPassword)

    await prisma.usuario.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    })

    await this.logoutAll(userId)

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
