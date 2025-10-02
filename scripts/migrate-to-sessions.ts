/**
 * Migration script to convert existing RefreshTokens to Sessions
 *
 * This script helps migrate from the old RefreshToken model to the new Session model.
 * Run this after deploying the new schema but before removing RefreshToken support.
 *
 * Usage:
 *   npx tsx scripts/migrate-to-sessions.ts
 */

import { PrismaClient, Platform } from "@prisma/client"

const prisma = new PrismaClient()

async function migrateRefreshTokensToSessions() {
  console.log("Starting migration from RefreshTokens to Sessions...")

  try {
    // Get all active refresh tokens
    const activeTokens = await prisma.refreshToken.findMany({
      where: {
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      include: {
        usuario: true,
      },
    })

    console.log(`Found ${activeTokens.length} active refresh tokens to migrate`)

    let migratedCount = 0
    let skippedCount = 0

    for (const token of activeTokens) {
      try {
        // Determine platform based on deviceId or userAgent
        // This is a heuristic - adjust based on your needs
        let platform: Platform = Platform.WEB

        if (token.deviceId) {
          // If deviceId exists, assume it's mobile
          platform = Platform.MOBILE
        } else if (token.userAgent) {
          // Check user agent for mobile indicators
          const mobileIndicators = ["Mobile", "Android", "iPhone", "iPad", "iOS"]
          const isMobile = mobileIndicators.some((indicator) => token.userAgent?.includes(indicator))
          platform = isMobile ? Platform.MOBILE : Platform.WEB
        }

        // Check if session already exists for this token
        const existingSession = await prisma.session.findUnique({
          where: {
            refreshTokenHash: token.tokenHash,
          },
        })

        if (existingSession) {
          console.log(`Session already exists for token ${token.id}, skipping`)
          skippedCount++
          continue
        }

        // Create new session
        await prisma.session.create({
          data: {
            userId: token.userId,
            platform,
            deviceId: token.deviceId,
            userAgent: token.userAgent,
            ip: token.ip,
            refreshTokenHash: token.tokenHash,
            refreshExpiresAt: token.expiresAt,
            createdAt: token.issuedAt,
            lastRotatedAt: null,
          },
        })

        migratedCount++
        console.log(`Migrated token ${token.id} to session (platform: ${platform})`)
      } catch (error) {
        console.error(`Error migrating token ${token.id}:`, error)
      }
    }

    console.log("\nMigration complete!")
    console.log(`Migrated: ${migratedCount}`)
    console.log(`Skipped: ${skippedCount}`)
    console.log(`Total: ${activeTokens.length}`)
  } catch (error) {
    console.error("Migration failed:", error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

// Run migration
migrateRefreshTokensToSessions()
  .then(() => {
    console.log("Migration script completed successfully")
    process.exit(0)
  })
  .catch((error) => {
    console.error("Migration script failed:", error)
    process.exit(1)
  })
