import type {
  Prisma,
  RecaladaOperativeStatus,
  RecaladaSource,
  StatusType,
} from "@prisma/client"

import { prisma } from "../../../prisma/client"
import { recaladaSelect, atencionSelectForRecalada } from "./recalada.select"
import { buildCodigoRecalada, tempCodigoRecalada } from "../_domain/recalada.rules"
import type { CreateRecaladaInput } from "../_domain/recalada.types"

export class RecaladaRepository {
  // -------------------------
  // Foreign keys
  // -------------------------
  findBuqueById(id: number) {
    return prisma.buque.findUnique({ where: { id }, select: { id: true } })
  }

  findPaisById(id: number) {
    return prisma.pais.findUnique({ where: { id }, select: { id: true } })
  }

  // -------------------------
  // Supervisor
  // -------------------------
  findSupervisorByUserId(userId: string) {
    return prisma.supervisor.findUnique({ where: { usuarioId: userId }, select: { id: true } })
  }

  createSupervisorForUser(userId: string) {
    return prisma.supervisor.create({ data: { usuarioId: userId }, select: { id: true } })
  }

  // -------------------------
  // Reads
  // -------------------------
  findById(id: number) {
    return prisma.recalada.findUnique({ where: { id }, select: recaladaSelect })
  }

  findByIdExists(id: number) {
    return prisma.recalada.findUnique({ where: { id }, select: { id: true } })
  }

  /**
   * Solape por buque tratando los intervalos como semiabiertos [llegada, salida).
   * Solo bloquean recaladas con status ACTIVO y operationalStatus SCHEDULED o ARRIVED.
   * Una recalada que termina exactamente en `fechaLlegada` NO solapa.
   */
  findOverlappingForBuque(args: {
    buqueId: number
    fechaLlegada: Date
    fechaSalida?: Date | null
    excludeId?: number
  }) {
    return prisma.recalada.findFirst({
      where: {
        buqueId: args.buqueId,
        id: args.excludeId ? { not: args.excludeId } : undefined,
        status: "ACTIVO",
        operationalStatus: { in: ["SCHEDULED", "ARRIVED"] },
        AND: [
          // existing ends strictly after new starts (semiabierto: fin == llegada no solapa)
          {
            OR: [
              { fechaSalida: null },
              { fechaSalida: { gt: args.fechaLlegada } },
            ],
          },
          // new ends strictly after existing starts (o nueva sin fin)
          args.fechaSalida
            ? { fechaLlegada: { lt: args.fechaSalida } }
            : {},
        ],
      },
      select: { id: true, codigoRecalada: true, fechaLlegada: true, fechaSalida: true },
    })
  }

  findByIdForUpdate(id: number) {
    return prisma.recalada.findUnique({
      where: { id },
      select: {
        id: true,
        buqueId: true,
        operationalStatus: true,
        fechaLlegada: true,
        fechaSalida: true,
      },
    })
  }

  findByIdForDepart(id: number) {
    return prisma.recalada.findUnique({
      where: { id },
      select: {
        id: true,
        operationalStatus: true,
        arrivedAt: true,
        fechaSalida: true,
      },
    })
  }

  findByIdForSimpleStatus(id: number) {
    return prisma.recalada.findUnique({
      where: { id },
      select: {
        id: true,
        operationalStatus: true,
        fechaLlegada: true,
      },
    })
  }

  findByIdForDelete(id: number) {
    return prisma.recalada.findUnique({
      where: { id },
      select: { id: true, codigoRecalada: true, operationalStatus: true },
    })
  }

  // -------------------------
  // Lists
  // -------------------------
  count(where: Prisma.RecaladaWhereInput) {
    return prisma.recalada.count({ where })
  }

  list(args: {
    where: Prisma.RecaladaWhereInput
    skip: number
    take: number
  }) {
    return prisma.recalada.findMany({
      where: args.where,
      orderBy: { fechaLlegada: "asc" },
      skip: args.skip,
      take: args.take,
      select: recaladaSelect,
    })
  }

  // -------------------------
  // Atenciones
  // -------------------------
  listAtencionesForRecalada(recaladaId: number) {
    return prisma.atencion.findMany({
      where: { recaladaId },
      select: atencionSelectForRecalada,
      orderBy: { fechaInicio: "asc" },
    })
  }

  findAtencionOutsideWindow(args: {
    recaladaId: number
    fechaLlegada: Date
    fechaSalida?: Date | null
  }) {
    const outside: Prisma.AtencionWhereInput[] = [
      { fechaInicio: { lt: args.fechaLlegada } },
      { fechaFin: { lt: args.fechaLlegada } },
    ]

    if (args.fechaSalida) {
      outside.push(
        { fechaInicio: { gt: args.fechaSalida } },
        { fechaFin: { gt: args.fechaSalida } },
      )
    }

    return prisma.atencion.findFirst({
      where: {
        recaladaId: args.recaladaId,
        operationalStatus: { not: "CANCELED" },
        OR: outside,
      },
      select: { id: true, fechaInicio: true, fechaFin: true },
      orderBy: { fechaInicio: "asc" },
    })
  }

  // -------------------------
  // Mutations
  // -------------------------
  async createWithCodigoAtomic(args: {
    input: CreateRecaladaInput
    supervisorId: string
    source: RecaladaSource
    status: StatusType
    operationalStatus: RecaladaOperativeStatus
    arrivedAt: Date | null
  }) {
    const created = await prisma.$transaction(async (tx) => {
      const tempCode = tempCodigoRecalada()

      const recalada = await tx.recalada.create({
        data: {
          buqueId: args.input.buqueId,
          paisOrigenId: args.input.paisOrigenId,
          supervisorId: args.supervisorId,

          codigoRecalada: tempCode,

          fechaLlegada: args.input.fechaLlegada,
          fechaSalida: args.input.fechaSalida ?? null,

          arrivedAt: args.arrivedAt,

          terminal: args.input.terminal ?? null,
          muelle: args.input.muelle ?? null,

          pasajerosEstimados: args.input.pasajerosEstimados ?? null,
          tripulacionEstimada: args.input.tripulacionEstimada ?? null,

          observaciones: args.input.observaciones ?? null,
          fuente: args.source,

          status: args.status,
          operationalStatus: args.operationalStatus,
        },
        select: { id: true, fechaLlegada: true },
      })

      const codigoFinal = buildCodigoRecalada(recalada.fechaLlegada, recalada.id)

      const updated = await tx.recalada.update({
        where: { id: recalada.id },
        data: { codigoRecalada: codigoFinal },
        select: recaladaSelect,
      })

      return updated
    })

    return created
  }

  update(id: number, data: Prisma.RecaladaUpdateInput) {
    return prisma.recalada.update({ where: { id }, data, select: recaladaSelect })
  }

  delete(id: number) {
    return prisma.recalada.delete({ where: { id } })
  }

  // -------------------------
  // Dependency counts
  // -------------------------
  countAtenciones(recaladaId: number) {
    return prisma.atencion.count({ where: { recaladaId } })
  }

  countTurnos(recaladaId: number) {
    return prisma.turno.count({ where: { atencion: { recaladaId } } })
  }

  countActiveAtenciones(recaladaId: number) {
    return prisma.atencion.count({
      where: { recaladaId, operationalStatus: { not: "CANCELED" } },
    })
  }

  countActiveTurnos(recaladaId: number) {
    return prisma.turno.count({
      where: { atencion: { recaladaId }, status: { not: "CANCELED" } },
    })
  }

  // Atenciones en estado OPEN (sin cerrar ni cancelar) — usadas para validar depart
  countOpenAtenciones(recaladaId: number) {
    return prisma.atencion.count({
      where: { recaladaId, operationalStatus: "OPEN" },
    })
  }
}

export const recaladaRepository = new RecaladaRepository()
