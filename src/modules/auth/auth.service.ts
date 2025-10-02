import { prisma } from "../../prisma/client"
import { hashPassword, verifyPassword } from "../../libs/password"
import { signAccessToken } from "../../libs/jwt"
import { generateRefreshToken, hashRefreshToken } from "../../libs/crypto"
import { UnauthorizedError, ConflictError, NotFoundError, BadRequestError } from "../../libs/errors"
import { logger } from "../../libs/logger"
import { parseTtlToSeconds } from "../../libs/time"   // ⬅️ NUEVO
import type { LoginRequest, RegisterRequest } from "./auth.schemas"
import type { RolType, Platform } from "@prisma/client"

// TTLs leídos del .env (con fallback)
const ACCESS_TTL_SEC = parseTtlToSeconds(process.env.JWT_ACCESS_TTL, 900)              // 15m por defecto
const REFRESH_TTL_SEC = parseTtlToSeconds(process.env.JWT_REFRESH_TTL, 60 * 60 * 24 * 30) // 30d por defecto

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

    const user = await prisma.usuario.findUnique({
      where: { email: data.email },
    })
    if (!user || !user.activo) {
      throw new UnauthorizedError("Invalid credentials")
    }

    const isValidPassword = await verifyPassword(data.password, user.passwordHash)
    if (!isValidPassword) {
      throw new UnauthorizedError("Invalid credentials")
    }

    // Refresh TTL desde .env
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

    // Nueva rotación
    const newRefreshTokenValue = generateRefreshToken()
    const newRefreshTokenHash = hashRefreshToken(newRefreshTokenValue)
    const newRefreshExpiresAt = new Date(Date.now() + REFRESH_TTL_SEC * 1000)

    // Rotación atómica
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
    await this.revokeAllUserSessions(userId)
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

    return { user: { id: user.id, email: user.email, nombres: user.nombres, apellidos: user.apellidos, rol: user.rol } }
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

  private async revokeAllUserSessions(userId: string): Promise<void> {
    await prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    })
  }
}

export const authService = new AuthService()
