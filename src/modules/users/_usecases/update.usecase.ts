import type { Request } from "express"
import type { RolType } from "@prisma/client"

import type { UpdateUserRequest } from "../../auth/auth.schemas"

import { NotFoundError } from "../../../libs/errors"
import { logger } from "../../../libs/logger"
import { logsService } from "../../../libs/logs/logs.service"

import { userRepository } from "../_data/user.repository"
import { buildUpdateUserData } from "../_domain/user.rules"

export async function updateUserUsecase(
  req: Request,
  id: string,
  data: UpdateUserRequest,
  updatedBy: string,
  updaterRole: RolType,
) {
  const existingUser = await userRepository.findByIdBasic(id)
  if (!existingUser) throw new NotFoundError("User not found")

  const updateData = buildUpdateUserData({ id, data, updatedBy, updaterRole })

  const updatedUser = await userRepository.updateUser(id, updateData as any)

  logger.info(
    { userId: id, updatedBy, changes: Object.keys(updateData) },
    "User updated",
  )

  logsService.audit(req, {
    event: "user.updated",
    target: { entity: "User", id: String(updatedUser.id), email: updatedUser.email },
    meta: { updatedBy, fields: Object.keys(updateData) },
    message: "User updated",
  })

  if (updateData.rol !== undefined && updateData.rol !== existingUser.rol) {
    logsService.audit(req, {
      event: "user.role.changed",
      target: { entity: "User", id: String(updatedUser.id), email: updatedUser.email },
      meta: { updatedBy, from: existingUser.rol, to: updatedUser.rol },
      message: "User role changed",
    })
  }

  return updatedUser
}