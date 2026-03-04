import type { Request } from "express"

import { authRepository } from "../_data/auth.repository"
import { logger } from "../../../libs/logger"
import { logsService } from "../../../libs/logs/logs.service"

export async function terminateAllSessionsUsecase(
  req: Request,
  userId: string,
  meta?: Record<string, any>,
): Promise<void> {
  const now = new Date()

  await authRepository.revokeAllUserSessionsWithRotationStamp(userId, now)

  logsService.audit(req, {
    event: "auth.logout",
    target: { entity: "User", id: String(userId) },
    meta: { scope: "all", ...meta },
    message: "All sessions terminated",
  })

  logger.info({ userId, ...meta }, "All user sessions terminated")
}