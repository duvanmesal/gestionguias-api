import type { Request } from "express"
import { ConflictError, NotFoundError } from "../../../libs/errors"
import { prisma } from "../../../prisma/client"
import { disponibilidadRepository } from "../disponibilidad.repository"
import { socketService } from "../../../core/socket/socket.service"

export async function desmarcarDisponibilidadUsecase(req: Request, atencionId: number) {
  const actorUserId = req.user!.userId

  const guia = await prisma.guia.findUnique({
    where: { usuarioId: actorUserId },
    select: { id: true },
  })

  if (!guia) throw new NotFoundError("No estás registrado como guía")

  const atencion = await prisma.atencion.findUnique({
    where: { id: atencionId },
    select: { operationalStatus: true, recalada: { select: { operationalStatus: true } } },
  })

  if (!atencion) throw new NotFoundError("Atención no encontrada")

  if (atencion.recalada.operationalStatus === "ARRIVED") {
    throw new ConflictError("Los turnos ya fueron asignados — no puedes desmarcar disponibilidad")
  }

  const existing = await disponibilidadRepository.findByAtencionAndGuia(atencionId, guia.id)
  if (!existing) throw new NotFoundError("No tienes disponibilidad marcada para esta atención")

  await disponibilidadRepository.delete(atencionId, guia.id)

  const payload = { atencionId, guiaId: guia.id, guiaUserId: actorUserId }
  socketService.emitToSupervisors("disponibilidad:desmarcada", payload)
  socketService.emitToGuia(actorUserId, "disponibilidad:desmarcada", payload)
}
