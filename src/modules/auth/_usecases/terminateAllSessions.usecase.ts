import type { Request } from "express"

import { authRepository } from "../_data/auth.repository"
import { logger } from "../../../libs/logger"
import { logsService } from "../../../libs/logs/logs.service"
import { socketService } from "../../../core/socket/socket.service"

export async function terminateAllSessionsUsecase(
  req: Request,
  userId: string,
  meta?: Record<string, any>,
): Promise<void> {
  const now = new Date()
  const sessions = await authRepository.listActiveSessionIds(userId)

  await authRepository.revokeAllUserSessionsWithRotationStamp(userId, now)

  for (const session of sessions) {
    socketService.emitToSession(session.id, "auth:sessionRevoked", {
      sessionId: session.id,
      userId,
      reason: meta?.reason ?? "logout_all",
    })
  }
  socketService.emitToUser(userId, "auth:sessionsChanged", { userId })

  logsService.audit(req, {
    event: "auth.logout",
    target: { entity: "User", id: String(userId) },
    meta: { scope: "all", ...meta },
    message: "All sessions terminated",
  })

  logger.info({ userId, ...meta }, "All user sessions terminated")
}
