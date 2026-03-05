import type { Prisma, StatusType } from "@prisma/client";
import { prisma } from "../../../prisma/client";
import {
  buqueSelect,
  buqueLookupSelect,
  buqueMinimalSelect,
} from "./buque.select";

export class BuqueRepository {
  async list(where: Prisma.BuqueWhereInput, page: number, pageSize: number) {
    const [total, items] = await Promise.all([
      prisma.buque.count({ where }),
      prisma.buque.findMany({
        where,
        orderBy: [{ updatedAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: buqueSelect,
      }),
    ]);

    return { items, total };
  }

  getById(id: number) {
    return prisma.buque.findUnique({
      where: { id },
      select: buqueSelect,
    });
  }

  getMinimalById(id: number) {
    return prisma.buque.findUnique({
      where: { id },
      select: buqueMinimalSelect,
    });
  }

  findByCodigos(codigos: string[]) {
    if (codigos.length === 0) return Promise.resolve([]);
    return prisma.buque.findMany({
      where: { codigo: { in: codigos } },
      select: {
        id: true,
        codigo: true,
        nombre: true,
        paisId: true,
        capacidad: true,
        naviera: true,
        status: true,
      },
    });
  }

  async findExistingPaisIds(paisIds: number[]) {
    if (paisIds.length === 0) return [];
    const rows = await prisma.pais.findMany({
      where: { id: { in: paisIds } },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  async countRecaladasByBuqueIds(buqueIds: number[]) {
    const map = new Map<number, number>();
    if (buqueIds.length === 0) return map;

    const rows = await prisma.recalada.groupBy({
      by: ["buqueId"],
      where: { buqueId: { in: buqueIds } },
      _count: { _all: true },
    });

    for (const row of rows) {
      const c = row._count?._all ?? 0;
      map.set(row.buqueId, c);
    }

    return map;
  }

  create(data: {
    codigo: string;
    nombre: string;
    paisId?: number | null;
    capacidad?: number | null;
    naviera?: string | null;
    status: StatusType;
  }) {
    return prisma.buque.create({
      data: {
        codigo: data.codigo,
        nombre: data.nombre,
        paisId: data.paisId ?? null,
        capacidad: data.capacidad ?? null,
        naviera: data.naviera ?? null,
        status: data.status,
      },
      select: buqueSelect,
    });
  }

  update(
    id: number,
    data: Partial<{
      codigo: string;
      nombre: string;
      paisId: number | null;
      capacidad: number | null;
      naviera: string | null;
      status: StatusType;
    }>,
  ) {
    return prisma.buque.update({
      where: { id },
      data: {
        ...(data.codigo !== undefined ? { codigo: data.codigo } : {}),
        ...(data.nombre !== undefined ? { nombre: data.nombre } : {}),
        ...(data.paisId !== undefined ? { paisId: data.paisId } : {}),
        ...(data.capacidad !== undefined ? { capacidad: data.capacidad } : {}),
        ...(data.naviera !== undefined ? { naviera: data.naviera } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
      },
      select: buqueSelect,
    });
  }

  setInactive(id: number) {
    return prisma.buque.update({
      where: { id },
      data: { status: "INACTIVO" },
      select: buqueMinimalSelect,
    });
  }

  lookup() {
    return prisma.buque.findMany({
      where: { status: "ACTIVO" },
      orderBy: [{ nombre: "asc" }],
      select: buqueLookupSelect,
    });
  }

  async paisExists(paisId: number) {
    const exists = await prisma.pais.findUnique({
      where: { id: paisId },
      select: { id: true },
    });
    return !!exists;
  }
}

export const buqueRepository = new BuqueRepository();
