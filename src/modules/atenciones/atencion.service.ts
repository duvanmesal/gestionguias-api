import { prisma } from "../../prisma/client";
import { BadRequestError, NotFoundError } from "../../libs/errors";
import { logger } from "../../libs/logger";
import type { Prisma, AtencionOperativeStatus, StatusType } from "@prisma/client";
import type { CreateAtencionBody, ListAtencionesQuery } from "./atencion.schemas";

const atencionSelect = {
  id: true,
  recaladaId: true,
  supervisorId: true,

  turnosTotal: true,
  descripcion: true,

  fechaInicio: true,
  fechaFin: true,

  status: true,
  operationalStatus: true,

  createdById: true,
  canceledAt: true,
  cancelReason: true,
  canceledById: true,

  createdAt: true,
  updatedAt: true,

  recalada: {
    select: {
      id: true,
      codigoRecalada: true,
      fechaLlegada: true,
      fechaSalida: true,
      status: true,
      operationalStatus: true,
      buque: { select: { id: true, nombre: true } },
    },
  },
  supervisor: {
    select: {
      id: true,
      usuario: {
        select: { id: true, email: true, nombres: true, apellidos: true },
      },
    },
  },

  // Útil para vista detalle y futuras ediciones
  turnos: {
    select: {
      id: true,
      numero: true,
      status: true,
      guiaId: true,
      fechaInicio: true,
      fechaFin: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { numero: "asc" as const },
  },
} satisfies Prisma.AtencionSelect;

export type ListAtencionesResult = {
  items: any[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
    from?: string;
    to?: string;
    filters: {
      recaladaId?: number;
      supervisorId?: string;
      status?: StatusType;
      operationalStatus?: AtencionOperativeStatus;
    };
  };
};

function toISO(d?: Date) {
  return d ? d.toISOString() : undefined;
}

export class AtencionService {
  /**
   * Crea una Atención (ventana + cupo).
   * - Valida existencia de la Recalada
   * - Resuelve supervisorId desde actorUserId (si no existe, lo crea)
   * - Crea Atencion y materializa Turnos 1..turnosTotal
   */
  static async create(input: CreateAtencionBody, actorUserId: string) {
    if (input.fechaFin < input.fechaInicio) {
      throw new BadRequestError("fechaFin debe ser >= fechaInicio");
    }

    // Validar que exista la Recalada
    const recalada = await prisma.recalada.findUnique({
      where: { id: input.recaladaId },
      select: { id: true },
    });
    if (!recalada) {
      throw new NotFoundError("La recalada (recaladaId) no existe");
    }

    // Resolver supervisorId desde usuario autenticado.
    // Si no existe supervisor (ej SUPER_ADMIN), lo creamos para cumplir FK.
    let supervisor = await prisma.supervisor.findUnique({
      where: { usuarioId: actorUserId },
      select: { id: true },
    });

    if (!supervisor) {
      logger.warn(
        { actorUserId },
        "[Atenciones] supervisor not found for user; creating one",
      );
      supervisor = await prisma.supervisor.create({
        data: { usuarioId: actorUserId },
        select: { id: true },
      });
    }

    const created = await prisma.$transaction(async (tx) => {
      const atencion = await tx.atencion.create({
        data: {
          recaladaId: input.recaladaId,
          supervisorId: supervisor!.id,

          turnosTotal: input.turnosTotal,
          descripcion: input.descripcion ?? null,

          fechaInicio: input.fechaInicio,
          fechaFin: input.fechaFin,

          // defaults: status=ACTIVO, operationalStatus=OPEN
          createdById: actorUserId,
        },
        select: { id: true, turnosTotal: true, fechaInicio: true, fechaFin: true },
      });

      // Materializar turnos 1..N
      const turnosData = Array.from({ length: atencion.turnosTotal }, (_, i) => ({
        atencionId: atencion.id,
        numero: i + 1,
        // Heredar ventana por defecto (opcional en Prisma)
        fechaInicio: atencion.fechaInicio,
        fechaFin: atencion.fechaFin,
        createdById: actorUserId,
        // status default AVAILABLE
      }));

      await tx.turno.createMany({
        data: turnosData,
        skipDuplicates: false,
      });

      // Retornar detalle completo
      return tx.atencion.findUnique({
        where: { id: atencion.id },
        select: atencionSelect,
      });
    });

    if (!created) {
      throw new BadRequestError("No fue posible crear la atención");
    }

    logger.info(
      { atencionId: created.id, recaladaId: created.recaladaId, actorUserId },
      "[Atenciones] created",
    );

    return created;
  }

  /**
   * Lista Atenciones con filtros/paginación.
   * Filtro de fechas por solapamiento de ventana:
   * - if from & to: fechaFin >= from AND fechaInicio <= to
   * - if only from: fechaFin >= from
   * - if only to: fechaInicio <= to
   */
  static async list(query: ListAtencionesQuery): Promise<ListAtencionesResult> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where: Prisma.AtencionWhereInput = {};

    if (query.recaladaId) where.recaladaId = query.recaladaId;
    if (query.supervisorId) where.supervisorId = query.supervisorId;
    if (query.status) where.status = query.status;
    if (query.operationalStatus) where.operationalStatus = query.operationalStatus;

    // Filtro de ventana por solapamiento
    if (query.from && query.to) {
      where.AND = [
        { fechaFin: { gte: query.from } },
        { fechaInicio: { lte: query.to } },
      ];
    } else if (query.from) {
      where.fechaFin = { gte: query.from };
    } else if (query.to) {
      where.fechaInicio = { lte: query.to };
    }

    const [total, rows] = await Promise.all([
      prisma.atencion.count({ where }),
      prisma.atencion.findMany({
        where,
        select: atencionSelect,
        orderBy: { fechaInicio: "asc" },
        skip,
        take: pageSize,
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return {
      items: rows,
      meta: {
        page,
        pageSize,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
        from: toISO(query.from),
        to: toISO(query.to),
        filters: {
          recaladaId: query.recaladaId,
          supervisorId: query.supervisorId,
          status: query.status,
          operationalStatus: query.operationalStatus,
        },
      },
    };
  }

  /**
   * Detalle por ID
   */
  static async getById(id: number) {
    const item = await prisma.atencion.findUnique({
      where: { id },
      select: atencionSelect,
    });

    if (!item) throw new NotFoundError("Atención no encontrada");

    return item;
  }
}
