import { Prisma } from "@prisma/client";
import { prisma } from "../../prisma/client";

export interface ListBuqueQuery {
  q?: string;
  paisId?: number;
  status?: "ACTIVO" | "INACTIVO";
  page?: number;
  pageSize?: number;
}

const DEFAULT_PAGE = 1;
const DEFAULT_SIZE = 10;

export class BuqueService {
  static async list(query: ListBuqueQuery) {
    const page = Math.max(Number(query.page) || DEFAULT_PAGE, 1);
    const pageSize = Math.min(
      Math.max(Number(query.pageSize) || DEFAULT_SIZE, 1),
      100,
    );

    const where: Prisma.BuqueWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.paisId ? { paisId: Number(query.paisId) } : {}),
      ...(query.q
        ? {
            OR: [
              { nombre: { contains: query.q, mode: "insensitive" } },
              { naviera: { contains: query.q, mode: "insensitive" } },
              { codigo: { contains: query.q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [total, items] = await Promise.all([
      prisma.buque.count({ where }),
      prisma.buque.findMany({
        where,
        orderBy: [{ updatedAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          codigo: true,
          nombre: true,
          status: true,
          capacidad: true,
          naviera: true,
          pais: { select: { id: true, codigo: true, nombre: true } },
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    return { items, total, page, pageSize };
  }

  static async get(id: number) {
    return prisma.buque.findUnique({
      where: { id },
      select: {
        id: true,
        codigo: true,
        nombre: true,
        status: true,
        capacidad: true,
        naviera: true,
        pais: { select: { id: true, codigo: true, nombre: true } },
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  static async create(data: {
    codigo: string;
    nombre: string;
    paisId?: number;
    capacidad?: number | null;
    naviera?: string | null;
    status?: "ACTIVO" | "INACTIVO";
  }) {
    // Validación país si viene
    if (data.paisId !== undefined) {
      const exists = await prisma.pais.findUnique({
        where: { id: data.paisId },
        select: { id: true },
      });
      if (!exists) {
        const err: any = new Error("El país (paisId) no existe");
        err.status = 400;
        throw err;
      }
    }

    return prisma.buque.create({
      data: {
        codigo: data.codigo,
        nombre: data.nombre,
        paisId: data.paisId ?? null,
        capacidad: data.capacidad ?? null,
        naviera: data.naviera ?? null,
        status: (data.status as any) ?? "ACTIVO",
      },
      select: {
        id: true,
        codigo: true,
        nombre: true,
        status: true,
        capacidad: true,
        naviera: true,
        pais: { select: { id: true, codigo: true, nombre: true } },
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  static async update(
    id: number,
    data: Partial<{
      codigo: string;
      nombre: string;
      paisId: number;
      capacidad: number | null;
      naviera: string | null;
      status: "ACTIVO" | "INACTIVO";
    }>,
  ) {
    if (data.paisId !== undefined) {
      const exists = await prisma.pais.findUnique({
        where: { id: data.paisId },
        select: { id: true },
      });
      if (!exists) {
        const err: any = new Error("El país (paisId) no existe");
        err.status = 400;
        throw err;
      }
    }

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
      select: {
        id: true,
        codigo: true, 
        nombre: true,
        status: true,
        capacidad: true,
        naviera: true,
        pais: { select: { id: true, codigo: true, nombre: true } },
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  // Soft delete: marca INACTIVO en vez de eliminar físicamente
  static async remove(id: number) {
    const exists = await prisma.buque.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!exists) {
      const err: any = new Error("El buque no existe");
      err.status = 404;
      throw err;
    }
    if (exists.status === "INACTIVO") return exists;

    return prisma.buque.update({
      where: { id },
      data: { status: "INACTIVO" },
      select: {
        id: true,
        codigo: true,
        nombre: true,
        status: true,
        updatedAt: true,
      },
    });
  }

  static async lookup() {
    return prisma.buque.findMany({
      where: { status: "ACTIVO" },
      orderBy: [{ nombre: "asc" }],
      select: {
        id: true,
        codigo: true,
        nombre: true,
        pais: { select: { id: true, codigo: true } },
      },
    });
  }
}
