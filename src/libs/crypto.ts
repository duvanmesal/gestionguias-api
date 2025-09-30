import { randomBytes, createHash, createHmac } from "crypto"
import { env } from "../config/env"

/**
 * Generates a cryptographically secure random refresh token
 */
export function generateRefreshToken(): string {
  return randomBytes(48).toString("base64url")
}

/**
 * Creates a hash of the refresh token for secure storage
 * Uses HMAC-SHA256 with a pepper for additional security
 */
export function hashRefreshToken(token: string): string {
  const pepper = env.REFRESH_TOKEN_PEPPER || "default_pepper_change_in_production"
  return createHmac("sha256", pepper).update(token).digest("hex")
}

/**
 * Generates a device ID from user agent and IP
 */
export function generateDeviceId(userAgent?: string, ip?: string): string {
  const data = `${userAgent || "unknown"}-${ip || "unknown"}`
  return createHash("sha256").update(data).digest("hex").substring(0, 16)
}
