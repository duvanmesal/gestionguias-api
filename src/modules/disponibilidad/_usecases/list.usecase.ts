import type { Request } from "express"
import { NotFoundError } from "../../../libs/errors"
import { prisma } from "../../../prisma/client"
import { disponibilidadRepository } from "../disponibilidad.repository"

export async function listDisponibilidadUsecase(req: Request, atencionId: number) {
  const atencion = await prisma.atencion.findUnique({
    where: { id: atencionId },
    select: { id: true },
  })

  if (!atencion) throw new NotFoundError("Atención no encontrada")

  const queue = await disponibilidadRepository.findQueueByAtencion(atencionId)

  return queue.map((d, i) => ({
    id: d.id,
    atencionId: d.atencionId,
    guiaId: d.guiaId,
    guiaUserId: d.guia.usuarioId,
    nombres: d.guia.usuario.nombres,
    apellidos: d.guia.usuario.apellidos,
    email: d.guia.usuario.email,
    marcadoAt: d.marcadoAt,
    penalizado: d.penalizado,
    posicion: i + 1,
  }))
}
