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
})

export const env = Env.parse(process.env)
export const corsOrigins = env.CORS_ORIGINS.split(",").map((s) => s.trim())
