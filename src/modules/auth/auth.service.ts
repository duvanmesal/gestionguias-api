import { prisma } from "../../prisma/client"
import { hashPassword, verifyPassword } from "../../libs/password"
import { signAccessToken } from "../../libs/jwt"
import { generateRefreshToken, hashRefreshToken, generateDeviceId } from "../../libs/crypto"
import { UnauthorizedError, ConflictError, NotFoundError } from "../../libs/errors"
import { logger } from "../../libs/logger"
import type { LoginRequest, RegisterRequest } from "./auth.schemas"
import type { RolType } from "@prisma/client"

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
    refreshToken: string
    refreshTokenExpiresAt: string
  }
}

export interface RefreshResult {
  tokens: {
    accessToken: string
    accessTokenExpiresIn: number
    refreshToken: string
    refreshTokenExpiresAt: string
  }
}

export class AuthService {
  async login(data: LoginRequest, ip?: string, userAgent?: string): Promise<LoginResult> {
    // Find active user by email
    const user = await prisma.usuario.findUnique({
      where: { email: data.email },
    })

    if (!user || !user.activo) {
      throw new UnauthorizedError("Invalid credentials")
    }

    // Verify password
    const isValidPassword = await verifyPassword(data.password, user.passwordHash)
    if (!isValidPassword) {
      throw new UnauthorizedError("Invalid credentials")
    }

    // Generate tokens
    const accessToken = signAccessToken({
      userId: user.id,
      email: user.email,
      rol: user.rol,
    })

    const refreshTokenValue = generateRefreshToken()
    const refreshTokenHash = hashRefreshToken(refreshTokenValue)
    const deviceId = generateDeviceId(userAgent, ip)

    // Store refresh token in database
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: refreshTokenHash,
        expiresAt,
        ip,
        userAgent,
        deviceId,
      },
    })

    logger.info({ userId: user.id, email: user.email }, "User logged in successfully")

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
        accessTokenExpiresIn: 15 * 60, // 15 minutes in seconds
        refreshToken: refreshTokenValue,
        refreshTokenExpiresAt: expiresAt.toISOString(),
      },
    }
  }

  async refresh(refreshToken: string, ip?: string, userAgent?: string): Promise<RefreshResult> {
    const refreshTokenHash = hashRefreshToken(refreshToken)

    // Find the refresh token
    const storedToken = await prisma.refreshToken.findUnique({
      where: { tokenHash: refreshTokenHash },
      include: { usuario: true },
    })

    if (!storedToken) {
      throw new UnauthorizedError("Invalid refresh token")
    }

    // Check if token is revoked or expired
    if (storedToken.revokedAt) {
      // Token reuse detected - revoke all tokens for this user
      await this.revokeAllUserTokens(storedToken.userId)
      throw new ConflictError("Token reuse detected. All sessions have been terminated.")
    }

    if (storedToken.expiresAt < new Date()) {
      throw new UnauthorizedError("Refresh token expired")
    }

    if (!storedToken.usuario.activo) {
      throw new UnauthorizedError("User account is inactive")
    }

    // Generate new tokens (rotation)
    const newAccessToken = signAccessToken({
      userId: storedToken.usuario.id,
      email: storedToken.usuario.email,
      rol: storedToken.usuario.rol,
    })

    const newRefreshTokenValue = generateRefreshToken()
    const newRefreshTokenHash = hashRefreshToken(newRefreshTokenValue)
    const deviceId = generateDeviceId(userAgent, ip)

    // Create new refresh token and revoke the old one
    const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

    await prisma.$transaction([
      // Revoke old token
      prisma.refreshToken.update({
        where: { id: storedToken.id },
        data: { revokedAt: new Date() },
      }),
      // Create new token
      prisma.refreshToken.create({
        data: {
          userId: storedToken.userId,
          tokenHash: newRefreshTokenHash,
          expiresAt: newExpiresAt,
          ip,
          userAgent,
          deviceId,
          replacedById: storedToken.id,
        },
      }),
    ])

    logger.info({ userId: storedToken.userId }, "Tokens refreshed successfully")

    return {
      tokens: {
        accessToken: newAccessToken,
        accessTokenExpiresIn: 15 * 60, // 15 minutes in seconds
        refreshToken: newRefreshTokenValue,
        refreshTokenExpiresAt: newExpiresAt.toISOString(),
      },
    }
  }

  async logout(refreshToken: string): Promise<void> {
    const refreshTokenHash = hashRefreshToken(refreshToken)

    const storedToken = await prisma.refreshToken.findUnique({
      where: { tokenHash: refreshTokenHash },
    })

    if (storedToken && !storedToken.revokedAt) {
      await prisma.refreshToken.update({
        where: { id: storedToken.id },
        data: { revokedAt: new Date() },
      })

      logger.info({ userId: storedToken.userId }, "User logged out successfully")
    }
  }

  async logoutAll(userId: string): Promise<void> {
    await this.revokeAllUserTokens(userId)
    logger.info({ userId }, "All user sessions terminated")
  }

  async register(
    data: RegisterRequest,
  ): Promise<{ user: { id: string; email: string; nombres: string; apellidos: string; rol: RolType } }> {
    // Check if user already exists
    const existingUser = await prisma.usuario.findUnique({
      where: { email: data.email },
    })

    if (existingUser) {
      throw new ConflictError("User with this email already exists")
    }

    // Hash password
    const passwordHash = await hashPassword(data.password)

    // Create user
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
      },
    })

    if (!user) {
      throw new NotFoundError("User not found")
    }

    return user
  }

  private async revokeAllUserTokens(userId: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    })
  }
}

export const authService = new AuthService()
