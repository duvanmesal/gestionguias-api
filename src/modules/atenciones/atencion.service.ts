import { prisma } from "../../prisma/client";
import { BadRequestError, NotFoundError, ConflictError } from "../../libs/errors";
import { logger } from "../../libs/logger";
import type { Prisma, AtencionOperativeStatus, StatusType } from "@prisma/client";
import type {
  CreateAtencionBody,
  ListAtencionesQuery,
  UpdateAtencionBody,
} from "./atencion.schemas";

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

export type AtencionTurnosSummary = {
  turnosTotal: number;
  availableCount: number;
  assignedCount: number;
  inProgressCount: number;
  completedCount: number;
  canceledCount: number;
  noShowCount: number;
};

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
        "[Atenciones] supervisor not found for user; creating one"
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
        fechaInicio: atencion.fechaInicio,
        fechaFin: atencion.fechaFin,
        createdById: actorUserId,
      }));

      await tx.turno.createMany({
        data: turnosData,
        skipDuplicates: false,
      });

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
      "[Atenciones] created"
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

  /**
   * Lista atenciones de una Recalada (para tab "Atenciones").
   */
  static async listByRecaladaId(recaladaId: number) {
    // Validar recalada existe (para 404 claro)
    const recalada = await prisma.recalada.findUnique({
      where: { id: recaladaId },
      select: { id: true },
    });
    if (!recalada) throw new NotFoundError("Recalada no encontrada");

    const items = await prisma.atencion.findMany({
      where: { recaladaId },
      select: atencionSelect,
      orderBy: { fechaInicio: "asc" },
    });

    return items;
  }

  /**
   * PATCH /atenciones/:id
   * Edita ventana/cupo/descripcion/status admin.
   *
   * Reglas clave implementadas:
   * - No permite editar si operationalStatus = CANCELED
   * - Si cambia ventana: actualiza Atencion y ajusta ventana de turnos NO asignados (guiaId = null)
   * - Si cambia turnosTotal:
   *   - Aumenta: crea nuevos turnos (numero old+1..new)
   *   - Disminuye: solo permite si los turnos a eliminar NO están asignados (guiaId = null)
   */
  static async update(id: number, body: UpdateAtencionBody, actorUserId: string) {
    const current = await prisma.atencion.findUnique({
      where: { id },
      select: {
        id: true,
        recaladaId: true,
        turnosTotal: true,
        fechaInicio: true,
        fechaFin: true,
        status: true,
        operationalStatus: true,
      },
    });

    if (!current) throw new NotFoundError("Atención no encontrada");

    if (current.operationalStatus === "CANCELED") {
      throw new ConflictError("No se puede editar una atención cancelada");
    }

    // Armar patch
    const patch: Prisma.AtencionUpdateInput = {};

    const newFechaInicio = body.fechaInicio ?? current.fechaInicio;
    const newFechaFin = body.fechaFin ?? current.fechaFin;

    if (newFechaFin < newFechaInicio) {
      throw new BadRequestError("fechaFin debe ser mayor o igual a fechaInicio");
    }

    const windowChanged =
      (body.fechaInicio && body.fechaInicio.getTime() !== current.fechaInicio.getTime()) ||
      (body.fechaFin && body.fechaFin.getTime() !== current.fechaFin.getTime());

    if (body.fechaInicio) patch.fechaInicio = body.fechaInicio;
    if (body.fechaFin) patch.fechaFin = body.fechaFin;

    if (typeof body.descripcion !== "undefined") {
      patch.descripcion = body.descripcion; // puede ser null
    }

    if (body.status) patch.status = body.status;

    const targetTurnosTotal =
      typeof body.turnosTotal === "number" ? body.turnosTotal : current.turnosTotal;

    if (targetTurnosTotal <= 0) {
      throw new BadRequestError("turnosTotal debe ser un entero positivo");
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1) Actualizar Atencion base (si aplica)
      const updatedAtencion = await tx.atencion.update({
        where: { id },
        data: {
          ...patch,
          ...(typeof body.turnosTotal === "number" ? { turnosTotal: body.turnosTotal } : {}),
        },
        select: { id: true, turnosTotal: true, fechaInicio: true, fechaFin: true },
      });

      // 2) Si cambió ventana, actualizar turnos NO asignados
      if (windowChanged) {
        await tx.turno.updateMany({
          where: { atencionId: id, guiaId: null },
          data: {
            fechaInicio: newFechaInicio,
            fechaFin: newFechaFin,
          },
        });
      }

      // 3) Ajuste de cupo (turnosTotal)
      const oldTotal = current.turnosTotal;
      const newTotal = targetTurnosTotal;

      if (newTotal > oldTotal) {
        // crear turnos faltantes
        const toCreate = Array.from({ length: newTotal - oldTotal }, (_, i) => ({
          atencionId: id,
          numero: oldTotal + i + 1,
          fechaInicio: newFechaInicio,
          fechaFin: newFechaFin,
          createdById: actorUserId,
        }));

        await tx.turno.createMany({ data: toCreate, skipDuplicates: false });
      }

      if (newTotal < oldTotal) {
        // Solo se pueden eliminar los turnos "sobrantes" si NO están asignados
        const extraTurnos = await tx.turno.findMany({
          where: { atencionId: id, numero: { gt: newTotal } },
          select: { id: true, numero: true, guiaId: true },
          orderBy: { numero: "asc" },
        });

        const assigned = extraTurnos.filter((t) => t.guiaId !== null);
        if (assigned.length > 0) {
          throw new ConflictError(
            `No se puede reducir el cupo: existen turnos asignados en los números > ${newTotal}`
          );
        }

        // borrar los extra
        await tx.turno.deleteMany({
          where: { atencionId: id, numero: { gt: newTotal } },
        });
      }

      // 4) Devolver detalle completo
      return tx.atencion.findUnique({
        where: { id },
        select: atencionSelect,
      });
    });

    if (!result) throw new BadRequestError("No fue posible actualizar la atención");

    logger.info(
      { atencionId: id, actorUserId, body },
      "[Atenciones] updated"
    );

    return result;
  }

  /**
   * PATCH /atenciones/:id/cancel
   * Cancela atención con razón y auditoría.
   */
  static async cancel(id: number, reason: string, actorUserId: string) {
    const current = await prisma.atencion.findUnique({
      where: { id },
      select: {
        id: true,
        operationalStatus: true,
        canceledAt: true,
      },
    });

    if (!current) throw new NotFoundError("Atención no encontrada");

    if (current.operationalStatus === "CANCELED") {
      // idempotencia "suave": si ya está cancelada, devolvemos la entidad
      const item = await prisma.atencion.findUnique({
        where: { id },
        select: atencionSelect,
      });
      if (!item) throw new NotFoundError("Atención no encontrada");
      return item;
    }

    if (current.operationalStatus === "CLOSED") {
      throw new ConflictError("No se puede cancelar una atención cerrada");
    }

    const updated = await prisma.atencion.update({
      where: { id },
      data: {
        operationalStatus: "CANCELED",
        canceledAt: new Date(),
        cancelReason: reason,
        canceledById: actorUserId,
      },
      select: atencionSelect,
    });

    logger.info({ atencionId: id, actorUserId }, "[Atenciones] canceled");

    return updated;
  }

  /**
   * PATCH /atenciones/:id/close
   * Cierra atención (operationalStatus -> CLOSED)
   */
  static async close(id: number, actorUserId: string) {
    const current = await prisma.atencion.findUnique({
      where: { id },
      select: { id: true, operationalStatus: true },
    });

    if (!current) throw new NotFoundError("Atención no encontrada");

    if (current.operationalStatus === "CANCELED") {
      throw new ConflictError("No se puede cerrar una atención cancelada");
    }

    if (current.operationalStatus === "CLOSED") {
      // idempotente
      const item = await prisma.atencion.findUnique({
        where: { id },
        select: atencionSelect,
      });
      if (!item) throw new NotFoundError("Atención no encontrada");
      return item;
    }

    const updated = await prisma.atencion.update({
      where: { id },
      data: {
        operationalStatus: "CLOSED",
      },
      select: atencionSelect,
    });

    logger.info({ atencionId: id, actorUserId }, "[Atenciones] closed");

    return updated;
  }

  /**
   * GET /atenciones/:id/turnos
   * Turnero UI: lista slots por número ASC (sin inflar payload).
   *
   * Incluye recomendado:
   * id, numero, status, guiaId, checkInAt, checkOutAt, canceledAt
   * opcional: mini info del guía si está asignado (nombre/email)
   */
  static async listTurnosByAtencionId(atencionId: number) {
    // 1) validar atención existe (para 404 claro)
    const atencion = await prisma.atencion.findUnique({
      where: { id: atencionId },
      select: { id: true },
    });
    if (!atencion) throw new NotFoundError("Atención no encontrada");

    // 2) traer turnos
    const items = await prisma.turno.findMany({
      where: { atencionId },
      orderBy: { numero: "asc" },
      select: {
        id: true,
        numero: true,
        status: true,
        guiaId: true,
        checkInAt: true,
        checkOutAt: true,
        canceledAt: true,
        guia: {
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

    // 3) devolver plano (sin nesting raro)
    return items.map((t) => ({
      id: t.id,
      numero: t.numero,
      status: t.status,
      guiaId: t.guiaId,
      checkInAt: t.checkInAt,
      checkOutAt: t.checkOutAt,
      canceledAt: t.canceledAt,
      guia: t.guia
        ? {
            id: t.guia.id,
            email: t.guia.usuario.email,
            nombres: t.guia.usuario.nombres,
            apellidos: t.guia.usuario.apellidos,
          }
        : null,
    }));
  }

  /**
   * GET /atenciones/:id/summary
   * Resumen de cupos por estado.
   *
   * Devuelve:
   * turnosTotal,
   * availableCount, assignedCount, inProgressCount, completedCount, canceledCount, noShowCount
   */
  static async getSummaryByAtencionId(atencionId: number): Promise<AtencionTurnosSummary> {
    // 1) validar atención existe y obtener turnosTotal
    const atencion = await prisma.atencion.findUnique({
      where: { id: atencionId },
      select: { id: true, turnosTotal: true },
    });
    if (!atencion) throw new NotFoundError("Atención no encontrada");

    // 2) contar por status (usa groupBy para 1 sola query)
    // Nota: status es enum del modelo Turno. No lo tipamos explícitamente aquí para no pelear con TS.
    const grouped = await prisma.turno.groupBy({
      by: ["status"],
      where: { atencionId },
      _count: { _all: true },
    });

    const counts = new Map<string, number>();
    for (const g of grouped) {
      counts.set(String(g.status), g._count._all);
    }

    // Helper: lee count o 0
    const c = (key: string) => counts.get(key) ?? 0;

    // Mapeo esperado por tu UI
    // Ajusta estos strings si tu enum de TurnoStatus se llama distinto.
    const summary: AtencionTurnosSummary = {
      turnosTotal: atencion.turnosTotal,
      availableCount: c("AVAILABLE"),
      assignedCount: c("ASSIGNED"),
      inProgressCount: c("IN_PROGRESS"),
      completedCount: c("COMPLETED"),
      canceledCount: c("CANCELED"),
      noShowCount: c("NO_SHOW"),
    };

    return summary;
  }
}
