import type { Request } from "express"
import { ConflictError, NotFoundError } from "../../../libs/errors"
import { prisma } from "../../../prisma/client"
import { disponibilidadRepository } from "../disponibilidad.repository"
import { socketService } from "../../../core/socket/socket.service"
import { penaltyService } from "../../penalties/penalty.service"

export async function marcarDisponibilidadUsecase(req: Request, atencionId: number) {
  const actorUserId = req.user!.userId

  const guia = await prisma.guia.findUnique({
    where: { usuarioId: actorUserId },
    select: { id: true, pendingPenalty: true, usuario: { select: { activo: true } } },
  })

  if (!guia) throw new NotFoundError("No estás registrado como guía")
  if (!guia.usuario.activo) throw new ConflictError("Tu cuenta de guía está inactiva")

  const atencion = await prisma.atencion.findUnique({
    where: { id: atencionId },
    select: {
      id: true,
      operationalStatus: true,
      status: true,
      recaladaId: true,
      recalada: { select: { operationalStatus: true } },
    },
  })

  if (!atencion) throw new NotFoundError("Atención no encontrada")
  if (atencion.status !== "ACTIVO") throw new ConflictError("La atención no está activa")
  if (atencion.operationalStatus !== "OPEN") {
    throw new ConflictError("La atención ya no está abierta para marcar disponibilidad")
  }
  if (atencion.recalada.operationalStatus === "ARRIVED") {
    throw new ConflictError("El buque ya llegó — la ventana de disponibilidad está cerrada")
  }
  if (
    atencion.recalada.operationalStatus === "DEPARTED" ||
    atencion.recalada.operationalStatus === "CANCELED"
  ) {
    throw new ConflictError("La recalada no está activa")
  }

  const existing = await disponibilidadRepository.findByAtencionAndGuia(atencionId, guia.id)
  if (existing) throw new ConflictError("Ya marcaste disponibilidad para esta atención")

  const turnoAsignado = await prisma.turno.findFirst({
    where: { atencionId, guiaId: guia.id },
    select: { id: true },
  })
  if (turnoAsignado) throw new ConflictError("Ya tienes un turno asignado en esta atención")

  // Epica 6: bloquear si tiene penalización vigente; lazy-sync si está obsoleta.
  const penaltyStatus = await penaltyService.isCurrentlyPenalized({
    guiaId: guia.id,
    pendingPenalty: guia.pendingPenalty,
  })
  if (penaltyStatus.penalized) {
    throw new ConflictError(
      penaltyStatus.activePenalty
        ? `No puedes marcar disponibilidad: tienes una penalización vigente hasta ${penaltyStatus.activePenalty.expiresAt.toISOString()}`
        : "No puedes marcar disponibilidad porque tienes una penalización pendiente",
    )
  }

  const disp = await disponibilidadRepository.create({
    atencionId,
    guiaId: guia.id,
    penalizado: false,
  })
  const penalizado = false

  const queue = await disponibilidadRepository.findQueueByAtencion(atencionId)
  const position = queue.findIndex((d) => d.guiaId === guia.id) + 1

  const payload = {
    atencionId,
    guiaId: guia.id,
    guiaUserId: actorUserId,
    penalizado,
    posicion: position,
    total: queue.length,
  }

  socketService.emitToSupervisors("disponibilidad:marcada", payload)
  socketService.emitToGuia(actorUserId, "disponibilidad:marcada", { ...payload, tuPosicion: position })

  return { ...disp, posicion: position }
}
