import type { Request } from "express"
import { prisma } from "../../../prisma/client"
import { disponibilidadRepository } from "../disponibilidad.repository"

export async function getMeDisponibilidadUsecase(req: Request, atencionId: number) {
  const actorUserId = req.user!.userId

  const guia = await prisma.guia.findUnique({
    where: { usuarioId: actorUserId },
    select: { id: true, pendingPenalty: true },
  })

  if (!guia) return { marcado: false, posicion: null, penalizado: null, pendingPenalty: false }

  const queue = await disponibilidadRepository.findQueueByAtencion(atencionId)
  const myIndex = queue.findIndex((d) => d.guiaId === guia.id)

  if (myIndex === -1) {
    return { marcado: false, posicion: null, penalizado: null, pendingPenalty: guia.pendingPenalty }
  }

  return {
    marcado: true,
    posicion: myIndex + 1,
    penalizado: queue[myIndex].penalizado,
    pendingPenalty: guia.pendingPenalty,
  }
}
