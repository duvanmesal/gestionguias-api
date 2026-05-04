import type { Request } from "express"

import { BusinessError, NotFoundError } from "../../../libs/errors"
import { logger } from "../../../libs/logger"
import { logsService } from "../../../libs/logs/logs.service"
import { socketService } from "../../../core/socket/socket.service"

import { userRepository } from "../_data/user.repository"

export async function activateUserUsecase(
  req: Request,
  id: string,
  activatedBy: string,
): Promise<void> {
  const user = await userRepository.findByIdBasic(id)
  if (!user) throw new NotFoundError("User not found")
  if (user.activo) throw new BusinessError("User is already active")

  await userRepository.activateUser(id)

  logger.info({ userId: id, activatedBy }, "User activated")

  logsService.audit(req, {
    event: "user.updated",
    target: { entity: "User", id: String(id), email: user.email },
    meta: { activatedBy, fields: ["activo"], from: false, to: true },
    message: "User activated",
  })

  const realtimePayload = {
    userId: id,
    rol: user.rol,
    activo: true,
    fields: ["activo"],
  }
  socketService.emitToAdmins("user:updated", realtimePayload)
  socketService.emitToUser(id, "user:updated", realtimePayload)
  if (user.rol === "GUIA") {
    const payload = { userId: id }
    socketService.emitToSupervisors("guides:lookupChanged", payload)
    socketService.emitToAdmins("guides:lookupChanged", payload)
  }
}
