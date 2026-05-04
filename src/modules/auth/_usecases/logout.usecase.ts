import type { Request } from "express"

import { authRepository } from "../_data/auth.repository"
import { logger } from "../../../libs/logger"
import { logsService } from "../../../libs/logs/logs.service"
import { socketService } from "../../../core/socket/socket.service"

export async function logoutUsecase(req: Request, sessionId: string): Promise<void> {
  const session = await authRepository.findSessionById(sessionId)
  if (session && !session.revokedAt) {
    const now = new Date()

    await authRepository.revokeSessionById(sessionId, now)

    socketService.emitToSession(sessionId, "auth:sessionRevoked", {
      sessionId,
      userId: session.userId,
      reason: "logout",
    })
    socketService.emitToUser(session.userId, "auth:sessionsChanged", {
      userId: session.userId,
    })

    logsService.audit(req, {
      event: "auth.logout",
      target: { entity: "Session", id: String(sessionId) },
      meta: { scope: "single", userId: String(session.userId) },
      message: "Session logged out",
    })

    logger.info({ userId: session.userId, sessionId }, "Session logged out successfully")
  }
}
