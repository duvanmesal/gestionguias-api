import type { Request } from "express"
import { TurnoAssignmentMode } from "@prisma/client"

import { socketService } from "../../../core/socket/socket.service"
import { ConflictError } from "../../../libs/errors"
import { logger } from "../../../libs/logger"
import { logsService } from "../../../libs/logs/logs.service"
import { autoAssignOpenTurnosGlobalUsecase } from "../../disponibilidad/_usecases/autoAssign.usecase"
import { operationalConfigService } from "../../operational-config/operational-config.service"
import { userRepository } from "../_data/user.repository"

function toDisponibilidadResponse(guia: {
  id: string
  usuarioId: string
  disponibleParaTurnos: boolean
  disponibilidadUpdatedAt: Date | null
  pendingPenalty: boolean
}) {
  return {
    guiaId: guia.id,
    disponibleParaTurnos: guia.disponibleParaTurnos,
    disponibilidadUpdatedAt: guia.disponibilidadUpdatedAt,
    pendingPenalty: guia.pendingPenalty,
  }
}

export async function getMyDisponibilidadUsecase(userId: string) {
  const guia = await userRepository.findGuiaAvailabilityByUserId(userId)

  if (!guia) {
    throw new ConflictError("El usuario autenticado no está registrado como guía")
  }

  return toDisponibilidadResponse(guia)
}

export async function updateMyDisponibilidadUsecase(
  req: Request,
  userId: string,
  disponible: boolean,
) {
  const current = await userRepository.findGuiaAvailabilityByUserId(userId)

  if (!current) {
    throw new ConflictError("El usuario autenticado no está registrado como guía")
  }

  if (!current.usuario.activo) {
    throw new ConflictError("Tu cuenta de guía está inactiva")
  }

  if (disponible && current.pendingPenalty) {
    throw new ConflictError("No puedes marcarte disponible porque tienes una penalización pendiente")
  }

  const now = new Date()
  const updated = await userRepository.updateGuiaAvailabilityByUserId(userId, disponible, now)
  const config = await operationalConfigService.get()

  logsService.audit(req, {
    event: "users.guia.disponibilidad.updated",
    message: "Guía global availability updated",
    target: { entity: "Guia", id: updated.id },
    meta: {
      actorUserId: userId,
      guiaId: updated.id,
      disponibleParaTurnos: updated.disponibleParaTurnos,
      turnoAssignmentMode: config.turnoAssignmentMode,
    },
  })

  const payload = {
    guiaId: updated.id,
    userId,
    disponibleParaTurnos: updated.disponibleParaTurnos,
    disponibilidadUpdatedAt: updated.disponibilidadUpdatedAt,
    pendingPenalty: updated.pendingPenalty,
    turnoAssignmentMode: config.turnoAssignmentMode,
  }

  socketService.emitToGuia(userId, "disponibilidad:globalChanged", payload)
  socketService.emitToSupervisors("disponibilidad:globalChanged", payload)
  socketService.emitToAdmins("disponibilidad:globalChanged", payload)

  if (updated.disponibleParaTurnos && config.turnoAssignmentMode === TurnoAssignmentMode.FIFO_GLOBAL) {
    autoAssignOpenTurnosGlobalUsecase().catch((err) => {
      logger.error({ err, guiaId: updated.id }, "[Users] error autoasignando por disponibilidad global")
    })
  }

  return {
    ...toDisponibilidadResponse(updated),
    turnoAssignmentMode: config.turnoAssignmentMode,
  }
}
