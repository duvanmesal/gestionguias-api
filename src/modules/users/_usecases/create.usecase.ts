import type { Request } from "express"

import type { CreateUserRequest } from "../../auth/auth.schemas"

import { ConflictError } from "../../../libs/errors"
import { logger } from "../../../libs/logger"
import { logsService } from "../../../libs/logs/logs.service"
import { hashPassword } from "../../../libs/password"

import { userRepository } from "../_data/user.repository"

export async function createUserUsecase(
  req: Request,
  data: CreateUserRequest,
  createdBy: string,
) {
  const existing = await userRepository.findByEmail(data.email)

  if (existing) {
    logsService.audit(req, {
      event: "user.created",
      level: "warn",
      target: { entity: "User", email: data.email },
      meta: { reason: "duplicate_email", createdBy },
      message: "User create failed",
    })
    throw new ConflictError("User with this email already exists")
  }

  const passwordHash = await hashPassword(data.password)

  const user = await userRepository.createUser({
    email: data.email,
    passwordHash,
    nombres: data.nombres,
    apellidos: data.apellidos,
    rol: data.rol,
  })

  logger.info(
    { userId: user.id, email: user.email, rol: user.rol, createdBy },
    "User created by admin",
  )

  logsService.audit(req, {
    event: "user.created",
    target: { entity: "User", id: String(user.id), email: user.email },
    meta: { createdBy, rol: user.rol },
    message: "User created",
  })

  return user
}