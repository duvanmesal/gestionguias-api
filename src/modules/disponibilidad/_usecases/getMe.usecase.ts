import type { Request } from "express"
import { prisma } from "../../../prisma/client"
import { disponibilidadRepository } from "../disponibilidad.repository"
import { penaltyService } from "../../penalties/penalty.service"

export async function getMeDisponibilidadUsecase(req: Request, atencionId: number) {
  const actorUserId = req.user!.userId

  const guia = await prisma.guia.findUnique({
    where: { usuarioId: actorUserId },
    select: { id: true, pendingPenalty: true },
  })

  if (!guia) {
    return {
      marcado: false,
      posicion: null,
      penalizado: null,
      pendingPenalty: false,
      penaltyExpiresAt: null,
      penaltyReason: null,
    }
  }

  // Epica 6: vigencia real basada en GuiaPenalty + lazy sync.
  const penaltyStatus = await penaltyService.isCurrentlyPenalized({
    guiaId: guia.id,
    pendingPenalty: guia.pendingPenalty,
  })

  const queue = await disponibilidadRepository.findQueueByAtencion(atencionId)
  const myIndex = queue.findIndex((d) => d.guiaId === guia.id)

  const base = {
    pendingPenalty: penaltyStatus.penalized,
    penaltyExpiresAt: penaltyStatus.activePenalty?.expiresAt?.toISOString() ?? null,
    penaltyReason: penaltyStatus.activePenalty?.reason ?? null,
  }

  if (myIndex === -1) {
    return { marcado: false, posicion: null, penalizado: null, ...base }
  }

  return {
    marcado: true,
    posicion: myIndex + 1,
    penalizado: queue[myIndex].penalizado,
    ...base,
  }
}
