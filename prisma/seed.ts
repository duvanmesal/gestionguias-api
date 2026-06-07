import "dotenv/config"

import { PrismaClient } from "@prisma/client"

import { upsertBaseCatalogsAndConfig } from "./seed/base"
import { cleanupDemoData } from "./seed/cleanup"
import { seedOperationalDemo } from "./seed/operations"
import { buildSeedContext, shouldSeedDemoData } from "./seed/context"

const prisma = new PrismaClient()

async function main() {
  console.log("Starting database seeding...")

  const context = buildSeedContext(prisma)

  await upsertBaseCatalogsAndConfig(context)

  if (shouldSeedDemoData(context)) {
    await cleanupDemoData(context)
    await seedOperationalDemo(context)
  } else {
    console.log("Demo data skipped (set SEED_DEMO_DATA=true to seed operational scenarios)")
  }

  console.log("Database seeding completed!")
}

main()
  .catch((error) => {
    console.error("Error during seeding:", error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
