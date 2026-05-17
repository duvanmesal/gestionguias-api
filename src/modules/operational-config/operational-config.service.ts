import type { Request } from "express"
import type { TurnoAssignmentMode } from "@prisma/client"

import { socketService } from "../../core/socket/socket.service"
import { logsService } from "../../libs/logs/logs.service"
import { operationalConfigRepository } from "./operational-config.repository"

export class OperationalConfigService {
  get() {
    return operationalConfigRepository.get()
  }

  getTurnoAssignmentMode() {
    return operationalConfigRepository.getTurnoAssignmentMode()
  }

  async updateTurnoAssignmentMode(req: Request, mode: TurnoAssignmentMode, actorUserId: string) {
    const config = await operationalConfigRepository.updateTurnoAssignmentMode(mode, actorUserId)

    logsService.audit(req, {
      event: "operationalConfig.turnoAssignmentMode.updated",
      message: "Operational turno assignment mode updated",
      target: { entity: "OperationalConfig", id: config.id },
      meta: {
        actorUserId,
        turnoAssignmentMode: mode,
      },
    })

    const payload = {
      id: config.id,
      turnoAssignmentMode: config.turnoAssignmentMode,
      updatedAt: config.updatedAt,
      updatedById: config.updatedById,
    }

    socketService.emitToSupervisors("operational-config:changed", payload)
    socketService.emitToAdmins("operational-config:changed", payload)
    socketService.emitToAllGuias("operational-config:changed", payload)

    return config
  }
}

export const operationalConfigService = new OperationalConfigService()
