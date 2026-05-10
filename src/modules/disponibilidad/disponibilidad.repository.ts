import { prisma } from "../../prisma/client"

export const disponibilidadRepository = {
  findByAtencionAndGuia(atencionId: number, guiaId: string) {
    return prisma.disponibilidad.findUnique({
      where: { atencionId_guiaId: { atencionId, guiaId } },
    })
  },

  findQueueByAtencion(atencionId: number) {
    return prisma.disponibilidad.findMany({
      where: { atencionId },
      orderBy: [{ penalizado: "asc" }, { marcadoAt: "asc" }],
      include: {
        guia: {
          select: {
            id: true,
            usuarioId: true,
            usuario: { select: { id: true, nombres: true, apellidos: true, email: true } },
          },
        },
      },
    })
  },

  findNextUnassignedInQueue(atencionId: number, assignedGuiaIds: string[]) {
    return prisma.disponibilidad.findFirst({
      where: {
        atencionId,
        guiaId: { notIn: assignedGuiaIds.length ? assignedGuiaIds : ["__none__"] },
      },
      orderBy: [{ penalizado: "asc" }, { marcadoAt: "asc" }],
      include: { guia: { select: { id: true, usuarioId: true } } },
    })
  },

  create(data: { atencionId: number; guiaId: string; penalizado: boolean }) {
    return prisma.disponibilidad.create({ data })
  },

  delete(atencionId: number, guiaId: string) {
    return prisma.disponibilidad.delete({
      where: { atencionId_guiaId: { atencionId, guiaId } },
    })
  },

  findGuiaWithPenalty(guiaId: string) {
    return prisma.guia.findUnique({
      where: { id: guiaId },
      select: { id: true, pendingPenalty: true, usuarioId: true },
    })
  },

  consumePenalty(guiaId: string) {
    return prisma.guia.update({
      where: { id: guiaId },
      data: { pendingPenalty: false },
    })
  },

  setPenalty(guiaId: string) {
    return prisma.guia.update({
      where: { id: guiaId },
      data: { pendingPenalty: true },
    })
  },

  findAtencionesOpenByRecalada(recaladaId: number) {
    return prisma.atencion.findMany({
      where: {
        recaladaId,
        operationalStatus: "OPEN",
        status: "ACTIVO",
      },
      select: { id: true, turnosTotal: true },
    })
  },

  findAssignedGuiaIdsInAtencion(atencionId: number) {
    return prisma.turno.findMany({
      where: { atencionId, guiaId: { not: null } },
      select: { guiaId: true },
    })
  },
}
