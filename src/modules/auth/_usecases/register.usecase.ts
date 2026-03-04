import type { RegisterRequest } from "../auth.schemas"
import type { RolType } from "@prisma/client"

import { authRepository } from "../_data/auth.repository"

import { hashPassword } from "../../../libs/password"
import { ConflictError } from "../../../libs/errors"
import { logger } from "../../../libs/logger"

export async function registerUsecase(
  data: RegisterRequest,
): Promise<{ user: { id: string; email: string; nombres: string; apellidos: string; rol: RolType } }> {
  const existingUser = await authRepository.findUserByEmailMinimal(data.email)
  if (existingUser) throw new ConflictError("User with this email already exists")

  const passwordHash = await hashPassword(data.password)

  const user = await authRepository.createUser({
    email: data.email,
    passwordHash,
    nombres: data.nombres,
    apellidos: data.apellidos,
    rol: data.rol,
  })

  logger.info({ userId: user.id, email: user.email, rol: user.rol }, "New user registered")

  return { user }
}