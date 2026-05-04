import { authRepository } from "../_data/auth.repository"
import { BadRequestError, NotFoundError } from "../../../libs/errors"
import { logger } from "../../../libs/logger"
import { socketService } from "../../../core/socket/socket.service"

export async function revokeSessionUsecase(sessionId: string, userId: string): Promise<void> {
  const session = await authRepository.findUserSession(sessionId, userId)
  if (!session) throw new NotFoundError("Session not found")
  if (session.revokedAt) throw new BadRequestError("Session already revoked")

  await authRepository.revokeSessionById(sessionId, new Date())
  socketService.emitToSession(sessionId, "auth:sessionRevoked", {
    sessionId,
    userId,
    reason: "session_revoked",
  })
  socketService.emitToUser(userId, "auth:sessionsChanged", { userId })
  logger.info({ userId, sessionId }, "Session revoked by user")
}
