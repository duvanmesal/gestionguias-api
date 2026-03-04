import type { Request } from "express"

import { BusinessError, NotFoundError } from "../../../libs/errors"
import { logger } from "../../../libs/logger"
import { logsService } from "../../../libs/logs/logs.service"

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
  await userRepository.deactivateUserAndRevokeTokensAtomic(id, now)

  logger.info({ userId: id, deactivatedBy }, "User deactivated")

  logsService.audit(req, {
    event: "user.updated",
    level: "warn",
    target: { entity: "User", id: String(id), email: user.email },
    meta: { deactivatedBy, fields: ["activo"], from: true, to: false },
    message: "User deactivated",
  })
}