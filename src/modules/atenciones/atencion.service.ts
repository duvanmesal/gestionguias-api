import type { Request } from "express";
import { prisma } from "../../prisma/client";
import {
  BadRequestError,
  NotFoundError,
  ConflictError,
} from "../../libs/errors";
import { logger } from "../../libs/logger";
import { logsService } from "../../libs/logs/logs.service";
import type {
  Prisma,
  AtencionOperativeStatus,
  StatusType,
} from "@prisma/client";
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

type OperativeGate = {
  atencion: { status: StatusType; operationalStatus: AtencionOperativeStatus };
  recalada: { status: StatusType; operationalStatus: any };
};

function assertOperacionPermitida(gate: OperativeGate) {
  // Admin status
  if (gate.recalada.status !== "ACTIVO") {
    throw new ConflictError("La recalada no está activa");
  }
  if (gate.atencion.status !== "ACTIVO") {
    throw new ConflictError("La atención no está activa");
  }

  // Recalada operative status
  if (gate.recalada.operationalStatus === "CANCELED") {
    throw new ConflictError("La recalada está cancelada");
  }
  if (gate.recalada.operationalStatus === "DEPARTED") {
    throw new ConflictError("La recalada ya finalizó (DEPARTED)");
  }

  // Atención operative status
  if (gate.atencion.operationalStatus === "CANCELED") {
    throw new ConflictError("La atención está cancelada");
  }
  if (gate.atencion.operationalStatus === "CLOSED") {
    throw new ConflictError("La atención está cerrada");
  }
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

function auditWarn(
  req: Request,
  event: string,
  message: string,
  meta?: Record<string, any>,
  target?: { entity?: string; id?: string },
) {
  logsService.audit(req, {
    event,
    level: "warn",
    message,
    meta,
    target,
  });
}

function auditInfo(
  req: Request,
  event: string,
  message: string,
  meta?: Record<string, any>,
  target?: { entity?: string; id?: string },
) {
  logsService.audit(req, {
    event,
    message,
    meta,
    target,
  });
}

export class AtencionService {
  /**
   * Crea una Atención (ventana + cupo).
   */
  static async create(
    req: Request,
    input: CreateAtencionBody,
    actorUserId: string,
  ) {
    // Reglas básicas de ventana
    if (input.fechaFin < input.fechaInicio) {
      auditWarn(
        req,
        "atenciones.create.failed",
        "Create atencion failed",
        {
          reason: "fechaFin_lt_fechaInicio",
          fechaInicio: input.fechaInicio?.toISOString?.(),
          fechaFin: input.fechaFin?.toISOString?.(),
        },
        { entity: "Atencion" },
      );
      throw new BadRequestError("fechaFin debe ser >= fechaInicio");
    }

    // total_turnos >= 1
    if (!Number.isInteger(input.turnosTotal) || input.turnosTotal < 1) {
      auditWarn(
        req,
        "atenciones.create.failed",
        "Create atencion failed",
        {
          reason: "turnosTotal_invalid",
          turnosTotal: input.turnosTotal,
        },
        { entity: "Atencion" },
      );
      throw new BadRequestError("turnosTotal debe ser un entero >= 1");
    }

    const now = new Date();

    //  Traer recalada
    const recalada = await prisma.recalada.findUnique({
      where: { id: input.recaladaId },
      select: {
        id: true,
        codigoRecalada: true,
        fechaLlegada: true,
        fechaSalida: true,
        status: true,
        operationalStatus: true,
      },
    });

    if (!recalada) {
      auditWarn(
        req,
        "atenciones.create.failed",
        "Create atencion failed",
        {
          reason: "recalada_not_found",
          recaladaId: input.recaladaId,
        },
        { entity: "Recalada", id: String(input.recaladaId) },
      );
      throw new NotFoundError("La recalada (recaladaId) no existe");
    }

    //  recalada operable
    if (recalada.status !== "ACTIVO") {
      auditWarn(
        req,
        "atenciones.create.failed",
        "Create atencion failed",
        {
          reason: "recalada_not_active",
          recaladaId: recalada.id,
          status: recalada.status,
        },
        { entity: "Recalada", id: String(recalada.id) },
      );
      throw new ConflictError("La recalada no está activa");
    }
    if (recalada.operationalStatus === "CANCELED") {
      auditWarn(
        req,
        "atenciones.create.failed",
        "Create atencion failed",
        {
          reason: "recalada_canceled",
          recaladaId: recalada.id,
        },
        { entity: "Recalada", id: String(recalada.id) },
      );
      throw new ConflictError("La recalada está cancelada");
    }
    if (recalada.operationalStatus === "DEPARTED") {
      auditWarn(
        req,
        "atenciones.create.failed",
        "Create atencion failed",
        {
          reason: "recalada_departed",
          recaladaId: recalada.id,
        },
        { entity: "Recalada", id: String(recalada.id) },
      );
      throw new ConflictError("La recalada ya finalizó (DEPARTED)");
    }

    if (recalada.fechaSalida && recalada.fechaSalida < now) {
      auditWarn(
        req,
        "atenciones.create.failed",
        "Create atencion failed",
        {
          reason: "recalada_fechaSalida_past",
          recaladaId: recalada.id,
          fechaSalida: recalada.fechaSalida.toISOString(),
          now: now.toISOString(),
        },
        { entity: "Recalada", id: String(recalada.id) },
      );
      throw new ConflictError(
        "No se puede crear una atención: la recalada ya zarpó (fechaSalida < ahora)",
      );
    }

    //  ventana dentro de recalada
    if (input.fechaInicio < recalada.fechaLlegada) {
      auditWarn(
        req,
        "atenciones.create.failed",
        "Create atencion failed",
        {
          reason: "fechaInicio_lt_fechaLlegada",
          recaladaId: recalada.id,
          fechaLlegada: recalada.fechaLlegada.toISOString(),
          fechaInicio: input.fechaInicio.toISOString(),
        },
        { entity: "Recalada", id: String(recalada.id) },
      );
      throw new BadRequestError(
        "fechaInicio debe ser >= fechaLlegada de la recalada",
      );
    }

    if (input.fechaFin < recalada.fechaLlegada) {
      auditWarn(
        req,
        "atenciones.create.failed",
        "Create atencion failed",
        {
          reason: "fechaFin_lt_fechaLlegada",
          recaladaId: recalada.id,
          fechaLlegada: recalada.fechaLlegada.toISOString(),
          fechaFin: input.fechaFin.toISOString(),
        },
        { entity: "Recalada", id: String(recalada.id) },
      );
      throw new BadRequestError(
        "fechaFin debe ser >= fechaLlegada de la recalada",
      );
    }

    if (recalada.fechaSalida) {
      if (input.fechaInicio > recalada.fechaSalida) {
        auditWarn(
          req,
          "atenciones.create.failed",
          "Create atencion failed",
          {
            reason: "fechaInicio_gt_fechaSalida",
            recaladaId: recalada.id,
            fechaSalida: recalada.fechaSalida.toISOString(),
            fechaInicio: input.fechaInicio.toISOString(),
          },
          { entity: "Recalada", id: String(recalada.id) },
        );
        throw new BadRequestError(
          "fechaInicio debe ser <= fechaSalida de la recalada",
        );
      }
      if (input.fechaFin > recalada.fechaSalida) {
        auditWarn(
          req,
          "atenciones.create.failed",
          "Create atencion failed",
          {
            reason: "fechaFin_gt_fechaSalida",
            recaladaId: recalada.id,
            fechaSalida: recalada.fechaSalida.toISOString(),
            fechaFin: input.fechaFin.toISOString(),
          },
          { entity: "Recalada", id: String(recalada.id) },
        );
        throw new BadRequestError(
          "fechaFin debe ser <= fechaSalida de la recalada",
        );
      }
    }

    //  contra “ahora”
    if (input.fechaInicio < now) {
      auditWarn(
        req,
        "atenciones.create.failed",
        "Create atencion failed",
        {
          reason: "fechaInicio_lt_now",
          now: now.toISOString(),
          fechaInicio: input.fechaInicio.toISOString(),
        },
        { entity: "Atencion" },
      );
      throw new BadRequestError("fechaInicio debe ser >= ahora");
    }
    if (input.fechaFin < now) {
      auditWarn(
        req,
        "atenciones.create.failed",
        "Create atencion failed",
        {
          reason: "fechaFin_lt_now",
          now: now.toISOString(),
          fechaFin: input.fechaFin.toISOString(),
        },
        { entity: "Atencion" },
      );
      throw new BadRequestError("fechaFin debe ser >= ahora");
    }

    //  overlap
    const overlap = await prisma.atencion.findFirst({
      where: {
        recaladaId: input.recaladaId,
        status: "ACTIVO",
        operationalStatus: { not: "CANCELED" },
        AND: [
          { fechaInicio: { lte: input.fechaFin } },
          { fechaFin: { gte: input.fechaInicio } },
        ],
      },
      select: { id: true, fechaInicio: true, fechaFin: true },
    });

    if (overlap) {
      auditWarn(
        req,
        "atenciones.create.failed",
        "Create atencion failed",
        {
          reason: "overlap",
          recaladaId: input.recaladaId,
          overlapAtencionId: overlap.id,
          overlapFechaInicio: overlap.fechaInicio.toISOString(),
          overlapFechaFin: overlap.fechaFin.toISOString(),
        },
        { entity: "Recalada", id: String(input.recaladaId) },
      );
      throw new ConflictError(
        "La ventana de la atención se solapa con otra atención existente en esta recalada",
      );
    }

    //  resolver supervisorId
    let supervisor = await prisma.supervisor.findUnique({
      where: { usuarioId: actorUserId },
      select: { id: true },
    });

    if (!supervisor) {
      logger.warn(
        { actorUserId },
        "[Atenciones] supervisor not found for user; creating one",
      );

      auditInfo(
        req,
        "atenciones.supervisor.autocreate",
        "Supervisor auto-created for actor",
        {
          actorUserId,
        },
        { entity: "Supervisor" },
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

          createdById: actorUserId,
        },
        select: {
          id: true,
          turnosTotal: true,
          fechaInicio: true,
          fechaFin: true,
        },
      });

      const turnosData = Array.from(
        { length: atencion.turnosTotal },
        (_, i) => ({
          atencionId: atencion.id,
          numero: i + 1,
          fechaInicio: atencion.fechaInicio,
          fechaFin: atencion.fechaFin,
          createdById: actorUserId,
        }),
      );

      await tx.turno.createMany({ data: turnosData, skipDuplicates: false });

      return tx.atencion.findUnique({
        where: { id: atencion.id },
        select: atencionSelect,
      });
    });

    if (!created) {
      auditWarn(
        req,
        "atenciones.create.failed",
        "Create atencion failed",
        {
          reason: "transaction_returned_null",
          recaladaId: input.recaladaId,
        },
        { entity: "Atencion" },
      );
      throw new BadRequestError("No fue posible crear la atención");
    }

    logger.info(
      { atencionId: created.id, recaladaId: created.recaladaId, actorUserId },
      "[Atenciones] created",
    );

    auditInfo(
      req,
      "atenciones.create.success",
      "Atencion created",
      {
        atencionId: created.id,
        recaladaId: created.recaladaId,
        codigoRecalada:
          created.recalada?.codigoRecalada ?? recalada.codigoRecalada,
        turnosTotal: created.turnosTotal,
        fechaInicio: created.fechaInicio?.toISOString?.(),
        fechaFin: created.fechaFin?.toISOString?.(),
        supervisorId: created.supervisorId,
      },
      { entity: "Atencion", id: String(created.id) },
    );

    return created;
  }

  static async list(
    req: Request,
    query: ListAtencionesQuery,
  ): Promise<ListAtencionesResult> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where: Prisma.AtencionWhereInput = {};

    if (query.recaladaId) where.recaladaId = query.recaladaId;
    if (query.supervisorId) where.supervisorId = query.supervisorId;
    if (query.status) where.status = query.status;
    if (query.operationalStatus)
      where.operationalStatus = query.operationalStatus;

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

    const result: ListAtencionesResult = {
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

    auditInfo(
      req,
      "atenciones.list",
      "Atenciones list",
      {
        page,
        pageSize,
        total,
        returned: rows.length,
        from: result.meta.from ?? null,
        to: result.meta.to ?? null,
        filters: result.meta.filters,
      },
      { entity: "Atencion" },
    );

    return result;
  }

  static async getById(req: Request, id: number) {
    const item = await prisma.atencion.findUnique({
      where: { id },
      select: atencionSelect,
    });

    if (!item) {
      auditWarn(
        req,
        "atenciones.getById.failed",
        "Get atencion failed",
        {
          reason: "not_found",
          atencionId: id,
        },
        { entity: "Atencion", id: String(id) },
      );
      throw new NotFoundError("Atención no encontrada");
    }

    auditInfo(
      req,
      "atenciones.getById",
      "Atencion detail",
      {
        atencionId: id,
        recaladaId: item.recaladaId,
        operationalStatus: item.operationalStatus,
        status: item.status,
      },
      { entity: "Atencion", id: String(id) },
    );

    return item;
  }

  static async listByRecaladaId(req: Request, recaladaId: number) {
    const recalada = await prisma.recalada.findUnique({
      where: { id: recaladaId },
      select: { id: true, codigoRecalada: true },
    });
    if (!recalada) {
      auditWarn(
        req,
        "atenciones.listByRecalada.failed",
        "List atenciones by recalada failed",
        {
          reason: "recalada_not_found",
          recaladaId,
        },
        { entity: "Recalada", id: String(recaladaId) },
      );
      throw new NotFoundError("Recalada no encontrada");
    }

    const items = await prisma.atencion.findMany({
      where: { recaladaId },
      select: atencionSelect,
      orderBy: { fechaInicio: "asc" },
    });

    auditInfo(
      req,
      "atenciones.listByRecalada",
      "Atenciones by recalada",
      {
        recaladaId,
        codigoRecalada: recalada.codigoRecalada,
        count: items.length,
      },
      { entity: "Recalada", id: String(recaladaId) },
    );

    return items;
  }

  static async update(
    req: Request,
    id: number,
    body: UpdateAtencionBody,
    actorUserId: string,
  ) {
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

    if (!current) {
      auditWarn(
        req,
        "atenciones.update.failed",
        "Update atencion failed",
        {
          reason: "not_found",
          atencionId: id,
        },
        { entity: "Atencion", id: String(id) },
      );
      throw new NotFoundError("Atención no encontrada");
    }

    if (current.operationalStatus === "CANCELED") {
      auditWarn(
        req,
        "atenciones.update.failed",
        "Update atencion failed",
        {
          reason: "already_canceled",
          atencionId: id,
        },
        { entity: "Atencion", id: String(id) },
      );
      throw new ConflictError("No se puede editar una atención cancelada");
    }

    const patch: Prisma.AtencionUpdateInput = {};

    const newFechaInicio = body.fechaInicio ?? current.fechaInicio;
    const newFechaFin = body.fechaFin ?? current.fechaFin;

    if (newFechaFin < newFechaInicio) {
      auditWarn(
        req,
        "atenciones.update.failed",
        "Update atencion failed",
        {
          reason: "fechaFin_lt_fechaInicio",
          atencionId: id,
        },
        { entity: "Atencion", id: String(id) },
      );
      throw new BadRequestError(
        "fechaFin debe ser mayor o igual a fechaInicio",
      );
    }

    const windowChanged =
      (body.fechaInicio &&
        body.fechaInicio.getTime() !== current.fechaInicio.getTime()) ||
      (body.fechaFin && body.fechaFin.getTime() !== current.fechaFin.getTime());

    if (windowChanged) {
      const now = new Date();

      const recalada = await prisma.recalada.findUnique({
        where: { id: current.recaladaId },
        select: {
          id: true,
          codigoRecalada: true,
          fechaLlegada: true,
          fechaSalida: true,
          status: true,
          operationalStatus: true,
        },
      });

      if (!recalada) {
        auditWarn(
          req,
          "atenciones.update.failed",
          "Update atencion failed",
          {
            reason: "recalada_not_found",
            atencionId: id,
            recaladaId: current.recaladaId,
          },
          { entity: "Recalada", id: String(current.recaladaId) },
        );
        throw new NotFoundError("La recalada (recaladaId) no existe");
      }

      if (recalada.status !== "ACTIVO") {
        auditWarn(
          req,
          "atenciones.update.failed",
          "Update atencion failed",
          {
            reason: "recalada_not_active",
            recaladaId: recalada.id,
            status: recalada.status,
          },
          { entity: "Recalada", id: String(recalada.id) },
        );
        throw new ConflictError("La recalada no está activa");
      }
      if (recalada.operationalStatus === "CANCELED") {
        auditWarn(
          req,
          "atenciones.update.failed",
          "Update atencion failed",
          {
            reason: "recalada_canceled",
            recaladaId: recalada.id,
          },
          { entity: "Recalada", id: String(recalada.id) },
        );
        throw new ConflictError("La recalada está cancelada");
      }
      if (recalada.operationalStatus === "DEPARTED") {
        auditWarn(
          req,
          "atenciones.update.failed",
          "Update atencion failed",
          {
            reason: "recalada_departed",
            recaladaId: recalada.id,
          },
          { entity: "Recalada", id: String(recalada.id) },
        );
        throw new ConflictError("La recalada ya finalizó (DEPARTED)");
      }
      if (recalada.fechaSalida && recalada.fechaSalida < now) {
        auditWarn(
          req,
          "atenciones.update.failed",
          "Update atencion failed",
          {
            reason: "recalada_fechaSalida_past",
            recaladaId: recalada.id,
          },
          { entity: "Recalada", id: String(recalada.id) },
        );
        throw new ConflictError(
          "No se puede editar la atención: la recalada ya zarpó (fechaSalida < ahora)",
        );
      }

      if (newFechaInicio < recalada.fechaLlegada) {
        auditWarn(
          req,
          "atenciones.update.failed",
          "Update atencion failed",
          {
            reason: "fechaInicio_lt_fechaLlegada",
            recaladaId: recalada.id,
          },
          { entity: "Recalada", id: String(recalada.id) },
        );
        throw new BadRequestError(
          "fechaInicio debe ser >= fechaLlegada de la recalada",
        );
      }
      if (newFechaFin < recalada.fechaLlegada) {
        auditWarn(
          req,
          "atenciones.update.failed",
          "Update atencion failed",
          {
            reason: "fechaFin_lt_fechaLlegada",
            recaladaId: recalada.id,
          },
          { entity: "Recalada", id: String(recalada.id) },
        );
        throw new BadRequestError(
          "fechaFin debe ser >= fechaLlegada de la recalada",
        );
      }
      if (recalada.fechaSalida) {
        if (newFechaInicio > recalada.fechaSalida) {
          auditWarn(
            req,
            "atenciones.update.failed",
            "Update atencion failed",
            {
              reason: "fechaInicio_gt_fechaSalida",
              recaladaId: recalada.id,
            },
            { entity: "Recalada", id: String(recalada.id) },
          );
          throw new BadRequestError(
            "fechaInicio debe ser <= fechaSalida de la recalada",
          );
        }
        if (newFechaFin > recalada.fechaSalida) {
          auditWarn(
            req,
            "atenciones.update.failed",
            "Update atencion failed",
            {
              reason: "fechaFin_gt_fechaSalida",
              recaladaId: recalada.id,
            },
            { entity: "Recalada", id: String(recalada.id) },
          );
          throw new BadRequestError(
            "fechaFin debe ser <= fechaSalida de la recalada",
          );
        }
      }

      if (newFechaInicio < now) {
        auditWarn(
          req,
          "atenciones.update.failed",
          "Update atencion failed",
          {
            reason: "fechaInicio_lt_now",
            atencionId: id,
          },
          { entity: "Atencion", id: String(id) },
        );
        throw new BadRequestError("fechaInicio debe ser >= ahora");
      }
      if (newFechaFin < now) {
        auditWarn(
          req,
          "atenciones.update.failed",
          "Update atencion failed",
          {
            reason: "fechaFin_lt_now",
            atencionId: id,
          },
          { entity: "Atencion", id: String(id) },
        );
        throw new BadRequestError("fechaFin debe ser >= ahora");
      }

      const overlap = await prisma.atencion.findFirst({
        where: {
          recaladaId: current.recaladaId,
          id: { not: id },
          status: "ACTIVO",
          operationalStatus: { not: "CANCELED" },
          AND: [
            { fechaInicio: { lte: newFechaFin } },
            { fechaFin: { gte: newFechaInicio } },
          ],
        },
        select: { id: true, fechaInicio: true, fechaFin: true },
      });

      if (overlap) {
        auditWarn(
          req,
          "atenciones.update.failed",
          "Update atencion failed",
          {
            reason: "overlap",
            atencionId: id,
            recaladaId: current.recaladaId,
            overlapAtencionId: overlap.id,
          },
          { entity: "Atencion", id: String(id) },
        );
        throw new ConflictError(
          "La ventana de la atención se solapa con otra atención existente en esta recalada",
        );
      }
    }

    if (body.fechaInicio) patch.fechaInicio = body.fechaInicio;
    if (body.fechaFin) patch.fechaFin = body.fechaFin;

    if (typeof body.descripcion !== "undefined") {
      patch.descripcion = body.descripcion;
    }

    if (body.status) patch.status = body.status;

    const targetTurnosTotal =
      typeof body.turnosTotal === "number"
        ? body.turnosTotal
        : current.turnosTotal;

    if (!Number.isInteger(targetTurnosTotal) || targetTurnosTotal <= 0) {
      auditWarn(
        req,
        "atenciones.update.failed",
        "Update atencion failed",
        {
          reason: "turnosTotal_invalid",
          atencionId: id,
          turnosTotal: targetTurnosTotal,
        },
        { entity: "Atencion", id: String(id) },
      );
      throw new BadRequestError("turnosTotal debe ser un entero positivo");
    }

    const result = await prisma.$transaction(async (tx) => {
      const updatedAtencion = await tx.atencion.update({
        where: { id },
        data: {
          ...patch,
          ...(typeof body.turnosTotal === "number"
            ? { turnosTotal: body.turnosTotal }
            : {}),
        },
        select: {
          id: true,
          turnosTotal: true,
          fechaInicio: true,
          fechaFin: true,
        },
      });

      if (windowChanged) {
        await tx.turno.updateMany({
          where: { atencionId: id, guiaId: null },
          data: { fechaInicio: newFechaInicio, fechaFin: newFechaFin },
        });
      }

      const oldTotal = current.turnosTotal;
      const newTotal = targetTurnosTotal;

      if (newTotal > oldTotal) {
        const toCreate = Array.from(
          { length: newTotal - oldTotal },
          (_, i) => ({
            atencionId: id,
            numero: oldTotal + i + 1,
            fechaInicio: newFechaInicio,
            fechaFin: newFechaFin,
            createdById: actorUserId,
          }),
        );
        await tx.turno.createMany({ data: toCreate, skipDuplicates: false });
      }

      if (newTotal < oldTotal) {
        const extraTurnos = await tx.turno.findMany({
          where: { atencionId: id, numero: { gt: newTotal } },
          select: { id: true, numero: true, guiaId: true },
          orderBy: { numero: "asc" },
        });

        const assigned = extraTurnos.filter((t) => t.guiaId !== null);
        if (assigned.length > 0) {
          throw new ConflictError(
            `No se puede reducir el cupo: existen turnos asignados en los números > ${newTotal}`,
          );
        }

        await tx.turno.deleteMany({
          where: { atencionId: id, numero: { gt: newTotal } },
        });
      }

      return tx.atencion.findUnique({
        where: { id },
        select: atencionSelect,
      });
    });

    if (!result) {
      auditWarn(
        req,
        "atenciones.update.failed",
        "Update atencion failed",
        {
          reason: "transaction_returned_null",
          atencionId: id,
        },
        { entity: "Atencion", id: String(id) },
      );
      throw new BadRequestError("No fue posible actualizar la atención");
    }

    logger.info(
      { atencionId: id, actorUserId, updatedKeys: Object.keys(body ?? {}) },
      "[Atenciones] updated",
    );

    auditInfo(
      req,
      "atenciones.update.success",
      "Atencion updated",
      {
        atencionId: id,
        recaladaId: current.recaladaId,
        actorUserId,
        windowChanged,
        updatedKeys: Object.keys(body ?? {}),
        newTurnosTotal:
          typeof body.turnosTotal === "number" ? body.turnosTotal : undefined,
      },
      { entity: "Atencion", id: String(id) },
    );

    return result;
  }

  static async cancel(
    req: Request,
    id: number,
    reason: string,
    actorUserId: string,
  ) {
    const gate = await prisma.atencion.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        operationalStatus: true,
        recalada: {
          select: {
            status: true,
            operationalStatus: true,
            id: true,
            codigoRecalada: true,
          },
        },
      },
    });

    if (!gate) {
      auditWarn(
        req,
        "atenciones.cancel.failed",
        "Cancel atencion failed",
        {
          reason: "not_found",
          atencionId: id,
        },
        { entity: "Atencion", id: String(id) },
      );
      throw new NotFoundError("Atención no encontrada");
    }

    if (gate.operationalStatus === "CANCELED") {
      auditInfo(
        req,
        "atenciones.cancel.noop",
        "Cancel atencion noop (already canceled)",
        {
          atencionId: id,
        },
        { entity: "Atencion", id: String(id) },
      );

      const item = await prisma.atencion.findUnique({
        where: { id },
        select: atencionSelect,
      });
      if (!item) throw new NotFoundError("Atención no encontrada");
      return item;
    }

    if (gate.operationalStatus === "CLOSED") {
      auditWarn(
        req,
        "atenciones.cancel.failed",
        "Cancel atencion failed",
        {
          reason: "already_closed",
          atencionId: id,
        },
        { entity: "Atencion", id: String(id) },
      );
      throw new ConflictError("No se puede cancelar una atención cerrada");
    }

    if (gate.recalada.operationalStatus === "CANCELED") {
      auditWarn(
        req,
        "atenciones.cancel.failed",
        "Cancel atencion failed",
        {
          reason: "recalada_canceled",
          recaladaId: gate.recalada.id,
        },
        { entity: "Recalada", id: String(gate.recalada.id) },
      );
      throw new ConflictError(
        "No se puede cancelar: la recalada está cancelada",
      );
    }
    if (gate.recalada.operationalStatus === "DEPARTED") {
      auditWarn(
        req,
        "atenciones.cancel.failed",
        "Cancel atencion failed",
        {
          reason: "recalada_departed",
          recaladaId: gate.recalada.id,
        },
        { entity: "Recalada", id: String(gate.recalada.id) },
      );
      throw new ConflictError(
        "No se puede cancelar: la recalada ya finalizó (DEPARTED)",
      );
    }

    const inProgressCount = await prisma.turno.count({
      where: { atencionId: id, status: "IN_PROGRESS" },
    });

    if (inProgressCount > 0) {
      auditWarn(
        req,
        "atenciones.cancel.failed",
        "Cancel atencion failed",
        {
          reason: "turnos_in_progress",
          atencionId: id,
          inProgressCount,
        },
        { entity: "Atencion", id: String(id) },
      );
      throw new ConflictError(
        "No se puede cancelar la atención: existen turnos en progreso (IN_PROGRESS)",
      );
    }

    const when = new Date();

    const updated = await prisma.$transaction(async (tx) => {
      await tx.turno.updateMany({
        where: { atencionId: id, status: { in: ["AVAILABLE", "ASSIGNED"] } },
        data: {
          status: "CANCELED",
          canceledAt: when,
          cancelReason: reason,
          canceledById: actorUserId,
        },
      });

      const atencion = await tx.atencion.update({
        where: { id },
        data: {
          operationalStatus: "CANCELED",
          canceledAt: when,
          cancelReason: reason,
          canceledById: actorUserId,
        },
        select: atencionSelect,
      });

      return atencion;
    });

    logger.info(
      { atencionId: id, actorUserId, canceledAt: when.toISOString() },
      "[Atenciones] canceled",
    );

    auditInfo(
      req,
      "atenciones.cancel.success",
      "Atencion canceled",
      {
        atencionId: id,
        recaladaId: updated.recaladaId,
        codigoRecalada: updated.recalada?.codigoRecalada,
        actorUserId,
        canceledAt: when.toISOString(),
        reason,
      },
      { entity: "Atencion", id: String(id) },
    );

    return updated;
  }

  static async close(req: Request, id: number, actorUserId: string) {
    const gate = await prisma.atencion.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        operationalStatus: true,
        recalada: {
          select: { status: true, operationalStatus: true, id: true },
        },
      },
    });

    if (!gate) {
      auditWarn(
        req,
        "atenciones.close.failed",
        "Close atencion failed",
        {
          reason: "not_found",
          atencionId: id,
        },
        { entity: "Atencion", id: String(id) },
      );
      throw new NotFoundError("Atención no encontrada");
    }

    if (gate.operationalStatus === "CLOSED") {
      auditInfo(
        req,
        "atenciones.close.noop",
        "Close atencion noop (already closed)",
        {
          atencionId: id,
        },
        { entity: "Atencion", id: String(id) },
      );

      const item = await prisma.atencion.findUnique({
        where: { id },
        select: atencionSelect,
      });
      if (!item) throw new NotFoundError("Atención no encontrada");
      return item;
    }

    if (gate.operationalStatus === "CANCELED") {
      auditWarn(
        req,
        "atenciones.close.failed",
        "Close atencion failed",
        {
          reason: "already_canceled",
          atencionId: id,
        },
        { entity: "Atencion", id: String(id) },
      );
      throw new ConflictError("No se puede cerrar una atención cancelada");
    }

    if (gate.recalada.operationalStatus === "CANCELED") {
      auditWarn(
        req,
        "atenciones.close.failed",
        "Close atencion failed",
        {
          reason: "recalada_canceled",
          recaladaId: gate.recalada.id,
        },
        { entity: "Recalada", id: String(gate.recalada.id) },
      );
      throw new ConflictError("No se puede cerrar: la recalada está cancelada");
    }
    if (gate.recalada.operationalStatus === "DEPARTED") {
      auditWarn(
        req,
        "atenciones.close.failed",
        "Close atencion failed",
        {
          reason: "recalada_departed",
          recaladaId: gate.recalada.id,
        },
        { entity: "Recalada", id: String(gate.recalada.id) },
      );
      throw new ConflictError(
        "No se puede cerrar: la recalada ya finalizó (DEPARTED)",
      );
    }

    const aliveCount = await prisma.turno.count({
      where: {
        atencionId: id,
        status: { in: ["AVAILABLE", "ASSIGNED", "IN_PROGRESS"] },
      },
    });

    if (aliveCount > 0) {
      auditWarn(
        req,
        "atenciones.close.failed",
        "Close atencion failed",
        {
          reason: "turnos_alive",
          atencionId: id,
          aliveCount,
        },
        { entity: "Atencion", id: String(id) },
      );
      throw new ConflictError(
        "No se puede cerrar la atención: aún existen turnos AVAILABLE/ASSIGNED/IN_PROGRESS",
      );
    }

    const updated = await prisma.atencion.update({
      where: { id },
      data: { operationalStatus: "CLOSED" },
      select: atencionSelect,
    });

    logger.info({ atencionId: id, actorUserId }, "[Atenciones] closed");

    auditInfo(
      req,
      "atenciones.close.success",
      "Atencion closed",
      {
        atencionId: id,
        recaladaId: updated.recaladaId,
        actorUserId,
      },
      { entity: "Atencion", id: String(id) },
    );

    return updated;
  }

  static async listTurnosByAtencionId(req: Request, atencionId: number) {
    const atencion = await prisma.atencion.findUnique({
      where: { id: atencionId },
      select: { id: true, recaladaId: true },
    });
    if (!atencion) {
      auditWarn(
        req,
        "atenciones.turnos.list.failed",
        "List turnos failed",
        {
          reason: "atencion_not_found",
          atencionId,
        },
        { entity: "Atencion", id: String(atencionId) },
      );
      throw new NotFoundError("Atención no encontrada");
    }

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
              select: { id: true, email: true, nombres: true, apellidos: true },
            },
          },
        },
      },
    });

    auditInfo(
      req,
      "atenciones.turnos.list",
      "Atencion turnos list",
      {
        atencionId,
        count: items.length,
      },
      { entity: "Atencion", id: String(atencionId) },
    );

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

  static async getSummaryByAtencionId(
    req: Request,
    atencionId: number,
  ): Promise<AtencionTurnosSummary> {
    const atencion = await prisma.atencion.findUnique({
      where: { id: atencionId },
      select: { id: true, turnosTotal: true },
    });
    if (!atencion) {
      auditWarn(
        req,
        "atenciones.summary.failed",
        "Get summary failed",
        {
          reason: "atencion_not_found",
          atencionId,
        },
        { entity: "Atencion", id: String(atencionId) },
      );
      throw new NotFoundError("Atención no encontrada");
    }

    const grouped = await prisma.turno.groupBy({
      by: ["status"],
      where: { atencionId },
      _count: { _all: true },
    });

    const counts = new Map<string, number>();
    for (const g of grouped) counts.set(String(g.status), g._count._all);
    const c = (key: string) => counts.get(key) ?? 0;

    const summary: AtencionTurnosSummary = {
      turnosTotal: atencion.turnosTotal,
      availableCount: c("AVAILABLE"),
      assignedCount: c("ASSIGNED"),
      inProgressCount: c("IN_PROGRESS"),
      completedCount: c("COMPLETED"),
      canceledCount: c("CANCELED"),
      noShowCount: c("NO_SHOW"),
    };

    auditInfo(
      req,
      "atenciones.summary",
      "Atencion summary",
      {
        atencionId,
        ...summary,
      },
      { entity: "Atencion", id: String(atencionId) },
    );

    return summary;
  }

  static async claimFirstAvailableTurno(
    req: Request,
    atencionId: number,
    actorUserId: string,
  ) {
    const guia = await prisma.guia.findUnique({
      where: { usuarioId: actorUserId },
      select: { id: true },
    });

    if (!guia) {
      auditWarn(
        req,
        "atenciones.claim.failed",
        "Claim turno failed",
        {
          reason: "user_not_guia",
          atencionId,
          actorUserId,
        },
        { entity: "Guia" },
      );
      throw new ConflictError(
        "El usuario autenticado no está registrado como guía",
      );
    }

    try {
      const claimed = await prisma.$transaction(async (tx) => {
        const atencionGate = await tx.atencion.findUnique({
          where: { id: atencionId },
          select: {
            id: true,
            status: true,
            operationalStatus: true,
            recalada: { select: { status: true, operationalStatus: true } },
          },
        });

        if (!atencionGate) throw new NotFoundError("Atención no encontrada");

        assertOperacionPermitida({
          atencion: {
            status: atencionGate.status,
            operationalStatus: atencionGate.operationalStatus,
          },
          recalada: {
            status: atencionGate.recalada.status,
            operationalStatus: atencionGate.recalada.operationalStatus,
          },
        });

        const existing = await tx.turno.findFirst({
          where: { atencionId, guiaId: guia.id },
          select: { id: true },
        });

        if (existing) {
          throw new ConflictError(
            "Ya tienes un turno asignado en esta atención",
          );
        }

        const maxAttempts = 6;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          const candidate = await tx.turno.findFirst({
            where: { atencionId, status: "AVAILABLE", guiaId: null },
            orderBy: { numero: "asc" },
            select: { id: true, numero: true },
          });

          if (!candidate) {
            throw new ConflictError(
              "No hay cupos disponibles para esta atención",
            );
          }

          const updated = await tx.turno.updateMany({
            where: { id: candidate.id, status: "AVAILABLE", guiaId: null },
            data: { guiaId: guia.id, status: "ASSIGNED" },
          });

          if (updated.count === 1) {
            const turno = await tx.turno.findUnique({
              where: { id: candidate.id },
              select: {
                id: true,
                atencionId: true,
                numero: true,
                status: true,
                guiaId: true,
                fechaInicio: true,
                fechaFin: true,
                checkInAt: true,
                checkOutAt: true,
                createdAt: true,
                updatedAt: true,
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

            if (!turno)
              throw new BadRequestError("No fue posible completar el claim");
            return turno;
          }
        }

        throw new ConflictError(
          "No fue posible tomar cupo: alta concurrencia, intenta de nuevo",
        );
      });

      logger.info(
        { atencionId, actorUserId, guiaId: guia.id, turnoId: claimed.id },
        "[Atenciones] claim turno",
      );

      auditInfo(
        req,
        "atenciones.claim.success",
        "Turno claimed",
        {
          atencionId,
          actorUserId,
          guiaId: guia.id,
          turnoId: claimed.id,
          turnoNumero: claimed.numero,
        },
        { entity: "Turno", id: String(claimed.id) },
      );

      return claimed;
    } catch (err: any) {
      if (err?.code === "P2002") {
        auditWarn(
          req,
          "atenciones.claim.failed",
          "Claim turno failed",
          {
            reason: "unique_conflict",
            atencionId,
            actorUserId,
            guiaId: guia.id,
          },
          { entity: "Turno" },
        );
        throw new ConflictError("Ya tienes un turno asignado en esta atención");
      }

      auditWarn(
        req,
        "atenciones.claim.failed",
        "Claim turno failed",
        {
          reason: "exception",
          atencionId,
          errorName: err?.name,
          errorCode: err?.code,
          message: err?.message,
        },
        { entity: "Turno" },
      );

      throw err;
    }
  }
}
