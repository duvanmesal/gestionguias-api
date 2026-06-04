import type { Prisma, StatusType } from "@prisma/client"
import { prisma } from "../../../prisma/client"
import { puertoLookupSelect, puertoSelect } from "./puerto.select"

export class PuertoRepository {
  async list(where: Prisma.PuertoWhereInput, page: number, pageSize: number) {
    const [total, items] = await Promise.all([
      prisma.puerto.count({ where }),
      prisma.puerto.findMany({
        where,
        orderBy: [{ updatedAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: puertoSelect,
      }),
    ])

    return { items, total }
  }

  getById(id: number) {
    return prisma.puerto.findUnique({ where: { id }, select: puertoSelect })
  }

  paisExists(paisId: number) {
    return prisma.pais.findUnique({ where: { id: paisId }, select: { id: true } })
  }

  create(data: {
    codigo: string
    nombre: string
    ciudad: string
    paisId: number
    status: StatusType
  }) {
    return prisma.puerto.create({ data, select: puertoSelect })
  }

  update(
    id: number,
    data: Partial<{
      codigo: string
      nombre: string
      ciudad: string
      paisId: number
      status: StatusType
    }>,
  ) {
    return prisma.puerto.update({ where: { id }, data, select: puertoSelect })
  }

  delete(id: number) {
    return prisma.puerto.delete({ where: { id }, select: puertoSelect })
  }

  lookup() {
    return prisma.puerto.findMany({
      where: { status: "ACTIVO" },
      orderBy: [{ nombre: "asc" }],
      select: puertoLookupSelect,
    })
  }

  countMuelles(id: number) {
    return prisma.muelle.count({ where: { puertoId: id } })
  }

  countRecaladas(id: number) {
    return prisma.recalada.count({ where: { puertoId: id } })
  }
}

export const puertoRepository = new PuertoRepository()
