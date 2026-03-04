import type { Request } from "express"

import type { UpdateMeRequest } from "../user.schemas"

import { NotFoundError } from "../../../libs/errors"
import { logger } from "../../../libs/logger"
import { logsService } from "../../../libs/logs/logs.service"

import { userRepository } from "../_data/user.repository"
import { buildUpdateMeData, ensureHasUpdateFields } from "../_domain/user.rules"

export async function updateMeUsecase(req: Request, userId: string, data: UpdateMeRequest) {
  const user = await userRepository.findByIdBasic(userId)
  if (!user) throw new NotFoundError("User not found")

  const updateData = buildUpdateMeData(data)
  ensureHasUpdateFields(updateData)

  const updated = await userRepository.updateMe(userId, updateData)

  logger.info({ userId, changes: Object.keys(updateData) }, "User updated via /me")

  logsService.audit(req, {
    event: "user.updated",
    target: { entity: "User", id: String(updated.id), email: updated.email },
    meta: { by: "self", fields: Object.keys(updateData) },
    message: "User updated (me)",
  })

  return updated
}