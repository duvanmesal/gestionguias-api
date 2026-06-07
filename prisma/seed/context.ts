import type { PrismaClient } from "@prisma/client"

export type SeedEnv = Record<string, string | undefined>

export type SeedContext = {
  prisma: PrismaClient
  env: SeedEnv
  now: Date
  superAdminEmail: string
  superAdminPassword: string
}

export function buildSeedContext(prisma: PrismaClient): SeedContext {
  const env = process.env as SeedEnv
  return {
    prisma,
    env,
    now: new Date(),
    superAdminEmail: env.SEED_SUPERADMIN_EMAIL ?? "duvandev@test.com",
    superAdminPassword: env.SEED_SUPERADMIN_PASS ?? "Dev!123456",
  }
}

export function shouldSeedDemoData(context: SeedContext) {
  const nodeEnv = context.env.NODE_ENV ?? "development"
  return nodeEnv === "development" || context.env.SEED_DEMO_DATA === "true"
}
