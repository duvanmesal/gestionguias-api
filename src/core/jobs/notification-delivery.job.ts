import { logger } from "../../libs/logger"
import { dispatchPendingNotificationDeliveries } from "../../modules/notifications/notification.service"

const JOB_INTERVAL_MS = 30_000

export function startNotificationDeliveryJob() {
  setInterval(runNotificationDeliveryJob, JOB_INTERVAL_MS)
  logger.info("[Job] notification-delivery iniciado")
}

async function runNotificationDeliveryJob() {
  try {
    const processed = await dispatchPendingNotificationDeliveries()
    if (processed > 0) {
      logger.info({ processed }, "[Job] notification-delivery processed")
    }
  } catch (err) {
    logger.error(err, "[Job] notification-delivery error")
  }
}
