import { prisma } from "../../prisma/client";
import { BadRequestError, NotFoundError } from "../../libs/errors";
import { logger } from "../../libs/logger";
import type {
  RecaladaSource,
  StatusType,
  RecaladaOperativeStatus,
  Prisma,
} from "@prisma/client";
import type { ListRecaladasQuery } from "./recalada.schemas";

/**
 * Genera código final estilo RA-YYYY-000123 usando el ID autoincremental.
 * Ej: RA-2026-000015
 */
function buildCodigoRecalada(fechaLlegada: Date, id: number) {
  const year = fechaLlegada.getUTCFullYear();
  const seq = String(id).padStart(6, "0");
  return `RA-${year}-${seq}`;
}

/**
 * Código temporal ÚNICO para cumplir @unique al insertar antes de tener ID.
 */
function tempCodigoRecalada() {
  return `TEMP-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export type CreateRecaladaInput = {
  buqueId: number;
  paisOrigenId: number;
  fechaLlegada: Date;
  fechaSalida?: Date;

  terminal?: string;
  muelle?: string;

  pasajerosEstimados?: number;
  tripulacionEstimada?: number;

  observaciones?: string;
  fuente?: RecaladaSource;

  // opcional (si lo quieres permitir desde el inicio)
  status?: StatusType;
};

export type ListRecaladasResult = {
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
    q?: string;
    filters: {
      operationalStatus?: RecaladaOperativeStatus;
      buqueId?: number;
      paisOrigenId?: number;
    };
  };
};

function toISO(d?: Date) {
  return d ? d.toISOString() : undefined;
}

export class RecaladaService {
  /**
   * Crea una recalada (agenda madre).
   * - Valida existencia de buqueId y paisOrigenId
   * - Resuelve supervisorId desde usuarioId (si no existe supervisor, lo crea)
   * - Crea con codigoRecalada temporal y luego actualiza al definitivo (RA-YYYY-000123)
   * - operationalStatus queda por default: SCHEDULED
   */
  static async create(input: CreateRecaladaInput, actorUserId: string) {
    // Reglas simples adicionales (defensa extra; el schema ya lo valida)
    if (input.fechaSalida && input.fechaSalida < input.fechaLlegada) {
      throw new BadRequestError("fechaSalida debe ser >= fechaLlegada");
    }

    // Validar que existan Buque y País
    const [buque, pais] = await Promise.all([
      prisma.buque.findUnique({
        where: { id: input.buqueId },
        select: { id: true },
      }),
      prisma.pais.findUnique({
        where: { id: input.paisOrigenId },
        select: { id: true },
      }),
    ]);

    if (!buque) throw new NotFoundError("El buque (buqueId) no existe");
    if (!pais) throw new NotFoundError("El país (paisOrigenId) no existe");

    // Resolver supervisorId desde el usuario autenticado.
    // Si el usuario no tiene supervisor aún (ej SUPER_ADMIN), lo creamos para cumplir FK.
    let supervisor = await prisma.supervisor.findUnique({
      where: { usuarioId: actorUserId },
      select: { id: true },
    });

    if (!supervisor) {
      logger.warn(
        { actorUserId },
        "[Recaladas] supervisor not found for user; creating one",
      );
      supervisor = await prisma.supervisor.create({
        data: { usuarioId: actorUserId },
        select: { id: true },
      });
    }

    // Crear + actualizar código final dentro de transacción
    const created = await prisma.$transaction(async (tx) => {
      const tempCode = tempCodigoRecalada();

      const recalada = await tx.recalada.create({
        data: {
          buqueId: input.buqueId,
          paisOrigenId: input.paisOrigenId,
          supervisorId: supervisor!.id,

          codigoRecalada: tempCode,

          fechaLlegada: input.fechaLlegada,
          fechaSalida: input.fechaSalida ?? null,

          terminal: input.terminal ?? null,
          muelle: input.muelle ?? null,

          pasajerosEstimados: input.pasajerosEstimados ?? null,
          tripulacionEstimada: input.tripulacionEstimada ?? null,

          observaciones: input.observaciones ?? null,
          fuente: input.fuente ?? "MANUAL",

          status: input.status ?? "ACTIVO",
          // operationalStatus: default SCHEDULED (Prisma)
        },
        select: { id: true, fechaLlegada: true },
      });

      const codigoFinal = buildCodigoRecalada(
        recalada.fechaLlegada,
        recalada.id,
      );

      const updated = await tx.recalada.update({
        where: { id: recalada.id },
        data: { codigoRecalada: codigoFinal },
        select: {
          id: true,
          codigoRecalada: true,

          fechaLlegada: true,
          fechaSalida: true,

          status: true,
          operationalStatus: true,

          terminal: true,
          muelle: true,
          pasajerosEstimados: true,
          tripulacionEstimada: true,
          observaciones: true,
          fuente: true,

          createdAt: true,
          updatedAt: true,

          buque: { select: { id: true, nombre: true } },
          paisOrigen: { select: { id: true, codigo: true, nombre: true } },
          supervisor: {
            select: {
              id: true,
              usuario: {
                select: {
                  id: true,
                  email: true,
                  nombres: true,
                  apellidos: true,
                },
              },
            },
          },
        },
      });

      return updated;
    });

    logger.info(
      {
        recaladaId: created.id,
        codigoRecalada: created.codigoRecalada,
        actorUserId,
      },
      "[Recaladas] created",
    );

    return created;
  }

  /**
   * Lista recaladas (agenda) con filtros + paginación + búsqueda.
   * Semántica de agenda: solapamiento de rango
   * - Si from/to vienen:
   *   - Incluye recaladas con fechaLlegada <= to y (fechaSalida >= from o fechaSalida is null y fechaLlegada >= from)
   * - Si no viene rango: lista por filtros sin condición temporal (útil para debug/admin)
   */
  static async list(query: ListRecaladasQuery): Promise<ListRecaladasResult> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const skip = (page - 1) * pageSize;
    const take = pageSize;

    const where: Prisma.RecaladaWhereInput = {};

    // Vamos acumulando filtros en un AND[] local para evitar el lío de tipos Prisma
    const AND: Prisma.RecaladaWhereInput[] = [];

    // Filtros simples
    if (query.operationalStatus)
      AND.push({ operationalStatus: query.operationalStatus });
    if (query.buqueId) AND.push({ buqueId: query.buqueId });
    if (query.paisOrigenId) AND.push({ paisOrigenId: query.paisOrigenId });

    // Rango agenda (solapamiento)
    if (query.from || query.to) {
      const from = query.from;
      const to = query.to;

      if (to) {
        // evento empieza antes de cerrar la ventana
        AND.push({ fechaLlegada: { lte: to } });
      }

      if (from) {
        // evento termina después de abrir la ventana
        AND.push({
          OR: [
            { fechaSalida: { gte: from } },
            { fechaSalida: null, fechaLlegada: { gte: from } },
          ],
        });
      }
    }

    // Búsqueda q: codigoRecalada, observaciones, buque.nombre
    if (query.q) {
      const q = query.q.trim();
      AND.push({
        OR: [
          { codigoRecalada: { contains: q, mode: "insensitive" } },
          { observaciones: { contains: q, mode: "insensitive" } },
          { buque: { nombre: { contains: q, mode: "insensitive" } } },
        ],
      });
    }

    // Solo asigna AND si hay condiciones
    if (AND.length > 0) where.AND = AND;

    const [total, items] = await Promise.all([
      prisma.recalada.count({ where }),
      prisma.recalada.findMany({
        where,
        orderBy: { fechaLlegada: "asc" },
        skip,
        take,
        select: {
          id: true,
          codigoRecalada: true,

          fechaLlegada: true,
          fechaSalida: true,

          status: true,
          operationalStatus: true,

          terminal: true,
          muelle: true,
          pasajerosEstimados: true,
          tripulacionEstimada: true,
          observaciones: true,
          fuente: true,

          createdAt: true,
          updatedAt: true,

          buque: { select: { id: true, nombre: true } },
          paisOrigen: { select: { id: true, codigo: true, nombre: true } },
          supervisor: {
            select: {
              id: true,
              usuario: {
                select: {
                  id: true,
                  email: true,
                  nombres: true,
                  apellidos: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const meta = {
      page,
      pageSize,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
      from: toISO(query.from),
      to: toISO(query.to),
      q: query.q,
      filters: {
        operationalStatus: query.operationalStatus,
        buqueId: query.buqueId,
        paisOrigenId: query.paisOrigenId,
      },
    };

    logger.info(
      {
        page,
        pageSize,
        total,
        from: meta.from,
        to: meta.to,
        q: query.q,
        operationalStatus: query.operationalStatus,
        buqueId: query.buqueId,
        paisOrigenId: query.paisOrigenId,
      },
      "[Recaladas] list",
    );

    return { items, meta };
  }

  /**
   * GET /recaladas/:id
   * Trae el detalle completo de una recalada para vista de detalle y acciones operativas.
   */
  static async getById(id: number) {
    const item = await prisma.recalada.findUnique({
      where: { id },
      select: {
        id: true,
        codigoRecalada: true,

        fechaLlegada: true,
        fechaSalida: true,

        status: true,
        operationalStatus: true,

        terminal: true,
        muelle: true,
        pasajerosEstimados: true,
        tripulacionEstimada: true,
        observaciones: true,
        fuente: true,

        createdAt: true,
        updatedAt: true,

        buque: { select: { id: true, nombre: true } },
        paisOrigen: { select: { id: true, codigo: true, nombre: true } },
        supervisor: {
          select: {
            id: true,
            usuario: {
              select: {
                id: true,
                email: true,
                nombres: true,
                apellidos: true,
              },
            },
          },
        },
      },
    });

    if (!item) {
      throw new NotFoundError("La recalada no existe");
    }

    logger.info({ recaladaId: id }, "[Recaladas] getById");

    return item;
  }
}
