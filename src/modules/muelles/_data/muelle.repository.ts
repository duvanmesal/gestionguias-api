import type { Prisma, StatusType } from "@prisma/client"
import { prisma } from "../../../prisma/client"
import { muelleLookupSelect, muelleSelect } from "./muelle.select"

export class MuelleRepository {
  async list(where: Prisma.MuelleWhereInput, page: number, pageSize: number) {
    const [total, items] = await Promise.all([
      prisma.muelle.count({ where }),
      prisma.muelle.findMany({
        where,
        orderBy: [{ updatedAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: muelleSelect,
      }),
    ])

    return { items, total }
  }

  getById(id: number) {
    return prisma.muelle.findUnique({ where: { id }, select: muelleSelect })
  }

  puertoExists(puertoId: number) {
    return prisma.puerto.findUnique({ where: { id: puertoId }, select: { id: true } })
  }

  create(data: {
    codigo: string
    nombre: string
    puertoId: number
    capacidadCruceros?: number | null
    status: StatusType
  }) {
    return prisma.muelle.create({
      data: {
        codigo: data.codigo,
        nombre: data.nombre,
        puertoId: data.puertoId,
        capacidadCruceros: data.capacidadCruceros ?? null,
        status: data.status,
      },
      select: muelleSelect,
    })
  }

  update(
    id: number,
    data: Partial<{
      codigo: string
      nombre: string
      puertoId: number
      capacidadCruceros: number | null
      status: StatusType
    }>,
  ) {
    return prisma.muelle.update({ where: { id }, data, select: muelleSelect })
  }

  delete(id: number) {
    return prisma.muelle.delete({ where: { id }, select: muelleSelect })
  }

  lookup(puertoId?: number) {
    return prisma.muelle.findMany({
      where: { status: "ACTIVO", ...(puertoId ? { puertoId } : {}) },
      orderBy: [{ nombre: "asc" }],
      select: muelleLookupSelect,
    })
  }

  countRecaladas(id: number) {
    return prisma.recalada.count({ where: { muelleId: id } })
  }
}

export const muelleRepository = new MuelleRepository()
