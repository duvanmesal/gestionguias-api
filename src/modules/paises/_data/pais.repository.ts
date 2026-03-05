import type { Prisma, StatusType } from "@prisma/client"
import { prisma } from "../../../prisma/client"
import { paisLookupSelect, paisSelect } from "./pais.select"

export class PaisRepository {
  async list(where: Prisma.PaisWhereInput, page: number, pageSize: number) {
    const [total, items] = await Promise.all([
      prisma.pais.count({ where }),
      prisma.pais.findMany({
        where,
        orderBy: [{ updatedAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: paisSelect,
      }),
    ])

    return { items, total }
  }

  getById(id: number) {
    return prisma.pais.findUnique({
      where: { id },
      select: paisSelect,
    })
  }

  create(data: { codigo: string; nombre: string; status: StatusType }) {
    return prisma.pais.create({
      data: {
        codigo: data.codigo,
        nombre: data.nombre,
        status: data.status,
      },
      select: paisSelect,
    })
  }

  update(
    id: number,
    data: Partial<{ codigo: string; nombre: string; status: StatusType }>,
  ) {
    return prisma.pais.update({
      where: { id },
      data: {
        ...(data.codigo !== undefined ? { codigo: data.codigo } : {}),
        ...(data.nombre !== undefined ? { nombre: data.nombre } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
      },
      select: paisSelect,
    })
  }

  delete(id: number) {
    return prisma.pais.delete({
      where: { id },
      select: { id: true, codigo: true, nombre: true, status: true },
    })
  }

  countBuquesByPaisId(id: number) {
    return prisma.buque.count({ where: { paisId: id } })
  }

  lookup() {
    return prisma.pais.findMany({
      where: { status: "ACTIVO" },
      orderBy: [{ nombre: "asc" }],
      select: paisLookupSelect,
    })
  }
}

export const paisRepository = new PaisRepository()