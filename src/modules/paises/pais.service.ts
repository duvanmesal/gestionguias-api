import { Prisma } from "@prisma/client";
import { prisma } from "../../prisma/client";

export interface ListPaisQuery {
  q?: string;
  codigo?: string;
  status?: "ACTIVO" | "INACTIVO";
  page?: number;
  pageSize?: number;
}

const DEFAULT_PAGE = 1;
const DEFAULT_SIZE = 10;

export class PaisService {
  static async list(query: ListPaisQuery) {
    const page = Math.max(Number(query.page) || DEFAULT_PAGE, 1);
    const pageSize = Math.min(
      Math.max(Number(query.pageSize) || DEFAULT_SIZE, 1),
      100
    );

    const where: Prisma.PaisWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.codigo ? { codigo: { equals: query.codigo } } : {}),
      ...(query.q
        ? {
            OR: [
              { nombre: { contains: query.q, mode: "insensitive" } },
              { codigo: { contains: query.q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [total, items] = await Promise.all([
      prisma.pais.count({ where }),
      prisma.pais.findMany({
        where,
        orderBy: [{ updatedAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          codigo: true,
          nombre: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    return { items, total, page, pageSize };
  }

  static async get(id: number) {
    return prisma.pais.findUnique({
      where: { id },
      select: {
        id: true,
        codigo: true,
        nombre: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  static async create(data: {
    codigo: string;
    nombre: string;
    status?: "ACTIVO" | "INACTIVO";
  }) {
    return prisma.pais.create({
      data: {
        codigo: data.codigo,
        nombre: data.nombre,
        status: (data.status as any) ?? "ACTIVO",
      },
      select: {
        id: true,
        codigo: true,
        nombre: true,
        status: true,
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
      status: "ACTIVO" | "INACTIVO";
    }>
  ) {
    return prisma.pais.update({
      where: { id },
      data: {
        ...(data.codigo !== undefined ? { codigo: data.codigo } : {}),
        ...(data.nombre !== undefined ? { nombre: data.nombre } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
      },
      select: {
        id: true,
        codigo: true,
        nombre: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  static async remove(id: number) {
    // Regla: no eliminar si hay buques asociados
    const buques = await prisma.buque.count({ where: { paisId: id } });
    if (buques > 0) {
      const err: any = new Error(
        "No se puede eliminar el país: existen buques asociados"
      );
      err.status = 409;
      throw err;
    }
    return prisma.pais.delete({
      where: { id },
      select: { id: true, codigo: true, nombre: true, status: true },
    });
  }

  static async lookup() {
    return prisma.pais.findMany({
      where: { status: "ACTIVO" },
      orderBy: [{ nombre: "asc" }],
      select: { id: true, codigo: true, nombre: true },
    });
  }
}
