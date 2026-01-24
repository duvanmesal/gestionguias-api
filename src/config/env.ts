import "dotenv/config"
import { z } from "zod"

const Env = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PREFIX: z.string().default("/api/v1"),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),

  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("7d"),

  LOG_LEVEL: z.string().default("info"),

  REFRESH_TOKEN_PEPPER: z.string().min(16),

  SEED_SUPERADMIN_EMAIL: z.string().email().default("duvandev@test.com"),
  SEED_SUPERADMIN_PASS: z.string().min(8).default("dev!123456"),

  // Email
  SMTP_HOST: z.string().default("smtp-relay.brevo.com"),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().default(""),
  SMTP_PASS: z.string().default(""),
  EMAIL_FROM: z.string().default("duvanmesa2415@gmail.com"),

  APP_LOGIN_URL: z.string().url().default("http://localhost:3001/login"),

  // Invitations
  INVITE_TTL_HOURS: z.coerce.number().default(24),

  // Security
  PASSWORD_PEPPER: z.string().min(16).default(""),
  TOKEN_PEPPER: z.string().min(16).default(""),

  // ✅ NEW: Password reset
  APP_RESET_PASSWORD_URL: z.string().url().default("http://localhost:3001/reset-password"),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().default(15),

  // CORS
  CORS_ALLOWED_ORIGINS: z.string().default("http://localhost:3001,http://localhost:5173"),
  CORS_ALLOW_CREDENTIALS: z.coerce.boolean().default(true),
})

export const env = Env.parse(process.env)
export const corsOrigins = Env.shape.CORS_ALLOWED_ORIGINS.parse(process.env.CORS_ALLOWED_ORIGINS).split(",")
