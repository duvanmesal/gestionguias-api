import { NotFoundError } from "../../../libs/errors"
import { operationalConfigService } from "../../operational-config/operational-config.service"
import { userRepository } from "../_data/user.repository"

export async function getMeUsecase(userId: string) {
  const [user, config] = await Promise.all([
    userRepository.findMe(userId),
    operationalConfigService.get(),
  ])
  if (!user) throw new NotFoundError("User not found")

  return {
    ...user,
    guiaId: user.guia?.id ?? null,
    supervisorId: user.supervisor?.id ?? null,
    pendingPenalty: user.guia?.pendingPenalty ?? null,
    disponibleParaTurnos: user.guia?.disponibleParaTurnos ?? null,
    disponibilidadUpdatedAt: user.guia?.disponibilidadUpdatedAt ?? null,
    turnoAssignmentMode: config.turnoAssignmentMode,
  }
}
