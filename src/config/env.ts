import "dotenv/config"
import { z } from "zod"

const Env = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("7d"),
  CORS_ORIGINS: z.string().default("http://localhost:4200,http://localhost:8100"),
  LOG_LEVEL: z.string().default("info"),
  REFRESH_TOKEN_PEPPER: z.string().min(16),
  SEED_SUPERADMIN_EMAIL: z.string().email().default("duvandev@test.com"),
  SEED_SUPERADMIN_PASS: z.string().min(8).default("dev!123456"),

  SMTP_HOST: z.string().default("smtp-relay.brevo.com"),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().default(""),
  SMTP_PASS: z.string().default(""),
  EMAIL_FROM: z.string().default("duvanmesa2415@gmail.com"),

  APP_LOGIN_URL: z.string().url().default("http://localhost:4200/login"),
  INVITE_TTL_HOURS: z.coerce.number().default(24),
  PASSWORD_PEPPER: z.string().min(16).default(""),
  TOKEN_PEPPER: z.string().min(16).default(""),
})

export const env = Env.parse(process.env)
export const corsOrigins = env.CORS_ORIGINS.split(",").map((s) => s.trim())
