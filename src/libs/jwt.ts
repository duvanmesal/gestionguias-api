import * as jwt from "jsonwebtoken"
import { env } from "../config/env"
import type { RolType } from "@prisma/client"

type Secret = jwt.Secret
type SignOptions = jwt.SignOptions

export interface AccessTokenPayload {
  userId: string
  email: string
  rol: RolType
  jti?: string
}

export interface RefreshTokenPayload {
  userId: string
  tokenId: string
  version: number
}

export type JwtPayload = AccessTokenPayload & jwt.JwtPayload
export type JwtRefreshPayload = RefreshTokenPayload & jwt.JwtPayload

const accessOptions: SignOptions = {
  expiresIn: env.JWT_ACCESS_TTL,
  issuer: "gestionguias-api",
  audience: "gestionguias-client",
}

const refreshOptions: SignOptions = {
  expiresIn: env.JWT_REFRESH_TTL,
  issuer: "gestionguias-api",
  audience: "gestionguias-client",
}

export const signAccessToken = (payload: AccessTokenPayload): string => {
  const jti = `access_${Date.now()}_${Math.random().toString(36).substring(2)}`
  return jwt.sign({ ...payload, jti }, env.JWT_ACCESS_SECRET as Secret, accessOptions)
}

export const verifyAccessToken = (token: string): JwtPayload => {
  return jwt.verify(token, env.JWT_ACCESS_SECRET as Secret) as JwtPayload
}

export const signRefreshToken = (payload: RefreshTokenPayload): string => {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET as Secret, refreshOptions)
}

export const verifyRefreshToken = (token: string): JwtRefreshPayload => {
  return jwt.verify(token, env.JWT_REFRESH_SECRET as Secret) as JwtRefreshPayload
}

// Legacy exports for backward compatibility
export const signAccess = signAccessToken
export const verifyAccess = verifyAccessToken
export const signRefresh = signRefreshToken
export const verifyRefresh = verifyRefreshToken
