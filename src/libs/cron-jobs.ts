import { invitationService } from "../modules/invitations/invitation.service"
import { logger } from "./logger"

/**
 * Expire old invitations that have passed their TTL
 * Should be run periodically (e.g., every hour)
 */
export async function expireOldInvitations(): Promise<void> {
  try {
    const count = await invitationService.expireOldInvitations()
    if (count > 0) {
      logger.info({ expiredCount: count }, "Expired old invitations")
    }
  } catch (error) {
    logger.error({ error }, "Failed to expire old invitations")
  }
}

/**
 * Start all cron jobs
 */
export function startCronJobs(): void {
  // Run invitation expiration every hour
  const HOUR_IN_MS = 60 * 60 * 1000
  setInterval(expireOldInvitations, HOUR_IN_MS)

  logger.info("Cron jobs started")
}
