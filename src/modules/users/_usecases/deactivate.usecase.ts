import type { Request } from "express"

import { BusinessError, NotFoundError } from "../../../libs/errors"
import { logger } from "../../../libs/logger"
import { logsService } from "../../../libs/logs/logs.service"
import { socketService } from "../../../core/socket/socket.service"

import { userRepository } from "../_data/user.repository"
import { ensureNotSelfDeactivation } from "../_domain/user.rules"

export async function deactivateUserUsecase(
  req: Request,
  id: string,
  deactivatedBy: string,
): Promise<void> {
  const user = await userRepository.findByIdBasic(id)
  if (!user) throw new NotFoundError("User not found")
  if (!user.activo) throw new BusinessError("User is already inactive")

  ensureNotSelfDeactivation(id, deactivatedBy)

  const now = new Date()
  const sessions = await userRepository.listActiveSessionIds(id)
  await userRepository.deactivateUserAndRevokeTokensAtomic(id, now)

  logger.info({ userId: id, deactivatedBy }, "User deactivated")

  logsService.audit(req, {
    event: "user.updated",
    level: "warn",
    target: { entity: "User", id: String(id), email: user.email },
    meta: { deactivatedBy, fields: ["activo"], from: true, to: false },
    message: "User deactivated",
  })

  for (const session of sessions) {
    socketService.emitToSession(session.id, "auth:sessionRevoked", {
      sessionId: session.id,
      userId: id,
      reason: "user_deactivated",
    })
  }
  socketService.emitToUser(id, "auth:sessionsChanged", { userId: id })
  socketService.emitToAdmins("user:deactivated", {
    userId: id,
    rol: user.rol,
    activo: false,
  })
  if (user.rol === "GUIA") {
    const payload = { userId: id }
    socketService.emitToSupervisors("guides:lookupChanged", payload)
    socketService.emitToAdmins("guides:lookupChanged", payload)
  }
}
