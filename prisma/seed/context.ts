import type { PrismaClient } from "@prisma/client"

export type SeedEnv = Record<string, string | undefined>

export type SeedContext = {
  prisma: PrismaClient
  env: SeedEnv
  now: Date
  superAdminEmail: string
  superAdminPassword: string
}

function requireSeedEnv(env: SeedEnv, name: string) {
  const value = env[name]
  if (!value) {
    throw new Error(`Missing required seed environment variable: ${name}`)
  }
  return value
}

export function buildSeedContext(prisma: PrismaClient): SeedContext {
  const env = process.env as SeedEnv
  return {
    prisma,
    env,
    now: new Date(),
    superAdminEmail: env.SEED_SUPERADMIN_EMAIL ?? "duvandev@test.com",
    superAdminPassword: requireSeedEnv(env, "SEED_SUPERADMIN_PASS"),
  }
}

export function shouldSeedDemoData(context: SeedContext) {
  const nodeEnv = context.env.NODE_ENV ?? "development"
  return nodeEnv === "development" || context.env.SEED_DEMO_DATA === "true"
}
