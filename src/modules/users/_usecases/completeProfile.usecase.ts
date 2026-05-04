import type { Request } from "express"

import type { CompleteProfileRequest } from "../user.schemas"

import { BadRequestError, BusinessError, ConflictError, NotFoundError, UnauthorizedError } from "../../../libs/errors"
import { logger } from "../../../libs/logger"
import { logsService } from "../../../libs/logs/logs.service"
import { hashPassword, verifyPassword } from "../../../libs/password"
import { socketService } from "../../../core/socket/socket.service"

import { userRepository } from "../_data/user.repository"
import { maskDocumentNumber } from "../_domain/user.rules"

export async function completeProfileUsecase(
  req: Request,
  userId: string,
  data: CompleteProfileRequest,
) {
  const user = await userRepository.findByIdBasic(userId)
  if (!user) throw new NotFoundError("User not found")
  if (!user.activo) throw new BusinessError("Cannot complete profile for inactive user")
  if (user.profileStatus === "COMPLETE") {
    throw new BusinessError("Profile is already complete")
  }

  const currentPassword = data.currentPassword ?? data.oldPassword
  if (!currentPassword) throw new BusinessError("currentPassword/oldPassword is required")
  if (!user.passwordHash) throw new BusinessError("User has no password set")

  const okPassword = await verifyPassword(currentPassword, user.passwordHash)
  if (!okPassword) {
    logsService.audit(req, {
      event: "user.profile.completed.failed",
      level: "warn",
      target: { entity: "User", id: String(userId), email: user.email },
      meta: { reason: "invalid_current_password" },
      message: "Profile completion failed",
    })
    throw new UnauthorizedError("Current password is incorrect")
  }

  const samePassword = await verifyPassword(data.newPassword, user.passwordHash)
  if (samePassword) {
    logsService.audit(req, {
      event: "user.profile.completed.failed",
      level: "warn",
      target: { entity: "User", id: String(userId), email: user.email },
      meta: { reason: "same_password" },
      message: "Profile completion failed",
    })
    throw new BadRequestError("New password must be different from current password")
  }

  // unicidad documento (si viene)
  if ((data as any).documentType && (data as any).documentNumber) {
    const existing = await userRepository.findByDocument({
      documentType: (data as any).documentType,
      documentNumber: (data as any).documentNumber,
      excludeUserId: userId,
    })

    if (existing) {
      throw new ConflictError("A user with this document type and number already exists")
    }
  }

  const now = new Date()
  const newPasswordHash = await hashPassword(data.newPassword)

  const { updatedUser, sessions } = await userRepository.completeProfileAndPasswordAtomic(userId, {
    nombres: data.nombres,
    apellidos: data.apellidos,
    telefono: data.telefono,
    documentType: (data as any).documentType,
    documentNumber: (data as any).documentNumber,
    passwordHash: newPasswordHash,
    now,
  })

  const maskedDoc = maskDocumentNumber((data as any).documentNumber)

  logger.info(
    {
      userId,
      documentType: (data as any).documentType,
      documentNumberMasked: maskedDoc,
    },
    "User profile completed",
  )

  logsService.audit(req, {
    event: "user.profile.completed",
    target: { entity: "User", id: String(updatedUser.id), email: updatedUser.email },
    meta: {
      documentType: (data as any).documentType ?? null,
      hasPhone: !!data.telefono,
    },
    message: "Profile completed",
  })

  const realtimePayload = {
    userId: updatedUser.id,
    rol: updatedUser.rol,
    activo: updatedUser.activo,
    fields: ["profileStatus", "profileCompletedAt", "documentType", "telefono"],
  }

  for (const session of sessions) {
    socketService.emitToSession(session.id, "auth:sessionRevoked", {
      sessionId: session.id,
      userId,
      reason: "onboarding_password_change",
    })
  }

  socketService.emitToUser(userId, "auth:sessionsChanged", { userId })
  socketService.emitToAdmins("user:updated", realtimePayload)
  socketService.emitToUser(updatedUser.id, "user:updated", realtimePayload)
  if (updatedUser.rol === "GUIA") {
    const payload = { userId: updatedUser.id }
    socketService.emitToSupervisors("guides:lookupChanged", payload)
    socketService.emitToAdmins("guides:lookupChanged", payload)
  }

  return {
    ...updatedUser,
    documentNumber: maskedDoc,
  }
}
