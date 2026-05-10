import { prisma } from "../../../prisma/client"
import { disponibilidadRepository } from "../disponibilidad.repository"
import { socketService } from "../../../core/socket/socket.service"
import { logger } from "../../../libs/logger"

export async function autoAssignTurnosForRecaladaUsecase(recaladaId: number) {
  const atenciones = await disponibilidadRepository.findAtencionesOpenByRecalada(recaladaId)

  for (const atencion of atenciones) {
    await assignForAtencion(atencion.id)
  }
}

export async function assignForAtencion(atencionId: number) {
  const queue = await disponibilidadRepository.findQueueByAtencion(atencionId)
  if (!queue.length) return

  const turnosDisponibles = await prisma.turno.findMany({
    where: { atencionId, status: "AVAILABLE", guiaId: null },
    orderBy: { numero: "asc" },
    select: { id: true, numero: true },
  })

  const assignaciones: Array<{ turnoId: number; guiaId: string; guiaUserId: string }> = []

  for (let i = 0; i < Math.min(queue.length, turnosDisponibles.length); i++) {
    assignaciones.push({
      turnoId: turnosDisponibles[i].id,
      guiaId: queue[i].guiaId,
      guiaUserId: queue[i].guia.usuarioId,
    })
  }

  if (!assignaciones.length) return

  await prisma.$transaction(
    assignaciones.map(({ turnoId, guiaId }) =>
      prisma.turno.update({
        where: { id: turnoId },
        data: { guiaId, status: "ASSIGNED" },
      }),
    ),
  )

  logger.info({ atencionId, count: assignaciones.length }, "[Disponibilidad] turnos auto-asignados")

  const turnosActualizados = await prisma.turno.findMany({
    where: { id: { in: assignaciones.map((a) => a.turnoId) } },
    include: { atencion: { select: { recaladaId: true } } },
  })

  for (const turno of turnosActualizados) {
    const asig = assignaciones.find((a) => a.turnoId === turno.id)!
    const payload = {
      turnoId: turno.id,
      numero: turno.numero,
      atencionId,
      recaladaId: turno.atencion.recaladaId,
      guiaId: turno.guiaId,
      status: turno.status,
    }
    socketService.emitToAtencion(atencionId, "turno:assigned", payload)
    socketService.emitToSupervisors("turno:assigned", payload)
    socketService.emitToGuia(asig.guiaUserId, "turno:assigned", payload)
  }

  socketService.emitToSupervisors("atencion:asignacionCompleta", {
    atencionId,
    asignados: assignaciones.length,
  })
}

export async function autoAssignNextInQueue(atencionId: number, turnoId: number) {
  const assigned = await prisma.turno.findMany({
    where: { atencionId, guiaId: { not: null } },
    select: { guiaId: true },
  })
  const assignedGuiaIds = assigned.map((t) => t.guiaId as string)

  const next = await disponibilidadRepository.findNextUnassignedInQueue(atencionId, assignedGuiaIds)
  if (!next) {
    logger.info({ atencionId, turnoId }, "[Disponibilidad] no hay guía siguiente en cola para reemplazar")
    return null
  }

  const turno = await prisma.turno.update({
    where: { id: turnoId },
    data: { guiaId: next.guiaId, status: "ASSIGNED" },
    include: { atencion: { select: { recaladaId: true } } },
  })

  const payload = {
    turnoId: turno.id,
    numero: turno.numero,
    atencionId,
    recaladaId: turno.atencion.recaladaId,
    guiaId: turno.guiaId,
    status: turno.status,
  }

  socketService.emitToAtencion(atencionId, "turno:assigned", payload)
  socketService.emitToSupervisors("turno:assigned", payload)
  socketService.emitToGuia(next.guia.usuarioId, "turno:assigned", payload)

  logger.info(
    { atencionId, turnoId, guiaId: next.guiaId },
    "[Disponibilidad] turno reasignado por NO_SHOW",
  )

  return turno
}
