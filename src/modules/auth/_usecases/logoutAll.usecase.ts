import type { Request } from "express"

import type { LogoutAllRequest } from "../auth.schemas"

import { authRepository } from "../_data/auth.repository"
import { terminateAllSessionsUsecase } from "./terminateAllSessions.usecase"

import { verifyPassword } from "../../../libs/password"
import { BadRequestError, UnauthorizedError } from "../../../libs/errors"

export async function logoutAllUsecase(
  req: Request,
  userId: string,
  verification: LogoutAllRequest["verification"],
): Promise<void> {
  const user = await authRepository.findUserByIdForPasswordCheck(userId)
  if (!user || !user.activo) {
    throw new UnauthorizedError("User not found or inactive")
  }

  if (verification.method === "password") {
    const okPass = await verifyPassword(verification.password, user.passwordHash)
    if (!okPass) throw new UnauthorizedError("Invalid credentials")
  } else if (verification.method === "mfa") {
    throw new BadRequestError("MFA verification not implemented")
  } else {
    throw new BadRequestError("Unsupported verification method")
  }

  await terminateAllSessionsUsecase(req, userId)
}