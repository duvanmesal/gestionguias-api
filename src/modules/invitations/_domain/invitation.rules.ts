import crypto from "crypto";

// -------------------------
// Config
// -------------------------

export const INVITE_TTL_HOURS = Number.parseInt(
  process.env.INVITE_TTL_HOURS || "24",
  10,
);

/**
 * Se usa como "pepper" para hashear el token.
 * Nota: si está vacío, el hash sigue funcionando, pero es menos fuerte.
 */
export const PASSWORD_PEPPER = process.env.PASSWORD_PEPPER || "";

// -------------------------
// Helpers
// -------------------------

export function normalizeEmail(emailRaw: string): string {
  return emailRaw.trim().toLowerCase();
}

export function generateTempPassword(): string {
  // Evitamos caracteres ambiguos (0/O, 1/l/I) para que sea más usable.
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
  const length = 12;

  let password = "";
  const randomBytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) password += chars[randomBytes[i] % chars.length];
  return password;
}

export function generateInvitationToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function hashToken(token: string): string {
  return crypto
    .createHmac("sha256", PASSWORD_PEPPER)
    .update(token)
    .digest("hex");
}

export function buildExpiresAt(): Date {
  return new Date(Date.now() + INVITE_TTL_HOURS * 60 * 60 * 1000);
}