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

  getNoShowPenaltyDurationHours() {
    return operationalConfigRepository.getNoShowPenaltyDurationHours()
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

    this.broadcastChange(config)
    return config
  }

  async updateNoShowPenaltyDurationHours(
    req: Request,
    durationHours: number,
    actorUserId: string,
  ) {
    const previous = await operationalConfigRepository.get()
    const config = await operationalConfigRepository.updateNoShowPenaltyDurationHours(
      durationHours,
      actorUserId,
    )

    logsService.audit(req, {
      event: "operationalConfig.noShowPenaltyDurationHours.updated",
      message: "NO_SHOW penalty duration updated",
      target: { entity: "OperationalConfig", id: config.id },
      meta: {
        actorUserId,
        previousHours: previous.noShowPenaltyDurationHours,
        nextHours: config.noShowPenaltyDurationHours,
      },
    })

    this.broadcastChange(config)
    return config
  }

  private broadcastChange(config: {
    id: string
    turnoAssignmentMode: TurnoAssignmentMode
    noShowPenaltyDurationHours: number
    updatedAt: Date
    updatedById: string | null
  }) {
    const payload = {
      id: config.id,
      turnoAssignmentMode: config.turnoAssignmentMode,
      noShowPenaltyDurationHours: config.noShowPenaltyDurationHours,
      updatedAt: config.updatedAt,
      updatedById: config.updatedById,
    }

    socketService.emitToSupervisors("operational-config:changed", payload)
    socketService.emitToAdmins("operational-config:changed", payload)
    socketService.emitToAllGuias("operational-config:changed", payload)
  }
}

export const operationalConfigService = new OperationalConfigService()
