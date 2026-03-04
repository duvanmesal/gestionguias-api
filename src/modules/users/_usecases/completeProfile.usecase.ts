import type { Request } from "express"

import type { CompleteProfileRequest } from "../user.schemas"

import { BusinessError, ConflictError, NotFoundError } from "../../../libs/errors"
import { logger } from "../../../libs/logger"
import { logsService } from "../../../libs/logs/logs.service"

import { userRepository } from "../_data/user.repository"
import { maskDocumentNumber } from "../_domain/user.rules"

export async function completeProfileUsecase(
  req: Request,
  userId: string,
  data: CompleteProfileRequest,
) {
  const user = await userRepository.findByIdBasic(userId)
  if (!user) throw new NotFoundError("User not found")
  if (user.profileStatus === "COMPLETE") {
    throw new BusinessError("Profile is already complete")
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

  const updatedUser = await userRepository.completeProfileUpdate(userId, {
    nombres: data.nombres,
    apellidos: data.apellidos,
    telefono: data.telefono,
    documentType: (data as any).documentType,
    documentNumber: (data as any).documentNumber,
    now,
  })

  if (updatedUser.rol === "GUIA") {
    await userRepository.upsertGuiaForUser(updatedUser.id)
  }

  if (updatedUser.rol === "SUPERVISOR") {
    await userRepository.upsertSupervisorForUser(updatedUser.id)
  }

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

  return {
    ...updatedUser,
    documentNumber: maskedDoc,
  }
}