import { prisma } from "../../prisma/client";
import { BadRequestError, NotFoundError } from "../../libs/errors";
import { logger } from "../../libs/logger";
import type {
  RecaladaSource,
  StatusType,
  RecaladaOperativeStatus,
  Prisma,
  RolType,
} from "@prisma/client";
import type {
  ListRecaladasQuery,
  UpdateRecaladaBody,
} from "./recalada.schemas";

// ✅ logs facade
import type { Request } from "express";
import { logsService } from "../../libs/logs/logs.service";

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

export type UpdateRecaladaInput = UpdateRecaladaBody;

function pickAllowedFields<T extends Record<string, any>>(
  input: T,
  allowed: string[],
) {
  const out: Record<string, any> = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      out[key] = input[key];
    }
  }
  return out;
}

function normalizeNullableFields(
  data: Record<string, any>,
): Record<string, any> {
  return data;
}

const recaladaSelect = {
  id: true,
  codigoRecalada: true,

  fechaLlegada: true,
  fechaSalida: true,

  // ✅ Operación real
  arrivedAt: true,
  departedAt: true,
  canceledAt: true,
  cancelReason: true,

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
} satisfies Prisma.RecaladaSelect;

/**
 * Select de atenciones para el tab dentro del detalle de recalada.
 * (Incluye turnos porque suele ser útil para mostrar cupo ocupado/libre).
 */
const atencionSelectForRecalada = {
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

  supervisor: {
    select: {
      id: true,
      usuario: {
        select: { id: true, email: true, nombres: true, apellidos: true },
      },
    },
  },

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

function auditFail(
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

function auditOk(
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

export class RecaladaService {
  static async create(
    req: Request,
    input: CreateRecaladaInput,
    actorUserId: string,
  ) {
    // ✅ Regla base (ya la tenías): fechaSalida >= fechaLlegada
    if (input.fechaSalida && input.fechaSalida < input.fechaLlegada) {
      auditFail(
        req,
        "recaladas.create.failed",
        "Create recalada failed",
        {
          reason: "fechaSalida_lt_fechaLlegada",
          fechaLlegada: input.fechaLlegada?.toISOString?.(),
          fechaSalida: input.fechaSalida?.toISOString?.(),
        },
        { entity: "Recalada" },
      );
      throw new BadRequestError("fechaSalida debe ser >= fechaLlegada");
    }

    // ✅ PR-01: reglas “duras” operativas
    const now = new Date();
    const source: RecaladaSource = input.fuente ?? "MANUAL";

    if (source !== "IMPORT" && input.fechaSalida && input.fechaSalida < now) {
      auditFail(
        req,
        "recaladas.create.failed",
        "Create recalada failed",
        {
          reason: "manual_fechaSalida_past",
          fuente: source,
          fechaSalida: input.fechaSalida?.toISOString?.(),
          now: now.toISOString(),
        },
        { entity: "Recalada" },
      );
      throw new BadRequestError(
        "fechaSalida debe ser >= ahora para recalada MANUAL (operativa)",
      );
    }

    if (
      typeof input.pasajerosEstimados !== "undefined" &&
      input.pasajerosEstimados !== null &&
      input.pasajerosEstimados < 1
    ) {
      auditFail(
        req,
        "recaladas.create.failed",
        "Create recalada failed",
        {
          reason: "pasajerosEstimados_lt_1",
          pasajerosEstimados: input.pasajerosEstimados,
        },
        { entity: "Recalada" },
      );
      throw new BadRequestError("pasajerosEstimados debe ser >= 1");
    }

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

    if (!buque) {
      auditFail(
        req,
        "recaladas.create.failed",
        "Create recalada failed",
        {
          reason: "buque_not_found",
          buqueId: input.buqueId,
        },
        { entity: "Recalada" },
      );
      throw new NotFoundError("El buque (buqueId) no existe");
    }

    if (!pais) {
      auditFail(
        req,
        "recaladas.create.failed",
        "Create recalada failed",
        {
          reason: "paisOrigen_not_found",
          paisOrigenId: input.paisOrigenId,
        },
        { entity: "Recalada" },
      );
      throw new NotFoundError("El país (paisOrigenId) no existe");
    }

    let supervisor = await prisma.supervisor.findUnique({
      where: { usuarioId: actorUserId },
      select: { id: true },
    });

    if (!supervisor) {
      logger.warn(
        { actorUserId },
        "[Recaladas] supervisor not found for user; creating one",
      );

      // ✅ audit (info) porque es “side-effect” relevante
      auditOk(
        req,
        "recaladas.supervisor.autocreate",
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
          fuente: source,

          status: input.status ?? "ACTIVO",
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
        select: recaladaSelect,
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

    auditOk(
      req,
      "recaladas.create.success",
      "Recalada created",
      {
        actorUserId,
        buqueId: created.buque?.id ?? input.buqueId,
        paisOrigenId: created.paisOrigen?.id ?? input.paisOrigenId,
        operationalStatus: created.operationalStatus,
        status: created.status,
        fechaLlegada: created.fechaLlegada?.toISOString?.(),
        fechaSalida: created.fechaSalida?.toISOString?.() ?? null,
        fuente: created.fuente,
        terminal: created.terminal,
        muelle: created.muelle,
      },
      { entity: "Recalada", id: String(created.id) },
    );

    return created;
  }

  static async list(
    req: Request,
    query: ListRecaladasQuery,
  ): Promise<ListRecaladasResult> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const skip = (page - 1) * pageSize;
    const take = pageSize;

    const where: Prisma.RecaladaWhereInput = {};
    const AND: Prisma.RecaladaWhereInput[] = [];

    if (query.operationalStatus)
      AND.push({ operationalStatus: query.operationalStatus });
    if (query.buqueId) AND.push({ buqueId: query.buqueId });
    if (query.paisOrigenId) AND.push({ paisOrigenId: query.paisOrigenId });

    if (query.from || query.to) {
      const from = query.from;
      const to = query.to;

      if (to) {
        AND.push({ fechaLlegada: { lte: to } });
      }

      if (from) {
        AND.push({
          OR: [
            { fechaSalida: { gte: from } },
            { fechaSalida: null, fechaLlegada: { gte: from } },
          ],
        });
      }
    }

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

    if (AND.length > 0) where.AND = AND;

    const [total, items] = await Promise.all([
      prisma.recalada.count({ where }),
      prisma.recalada.findMany({
        where,
        orderBy: { fechaLlegada: "asc" },
        skip,
        take,
        select: recaladaSelect,
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

    auditOk(
      req,
      "recaladas.list",
      "Recaladas list",
      {
        page,
        pageSize,
        total,
        from: meta.from,
        to: meta.to,
        q: query.q ?? null,
        filters: meta.filters,
        returned: items.length,
      },
      { entity: "Recalada" },
    );

    return { items, meta };
  }

  static async getById(req: Request, id: number) {
    const item = await prisma.recalada.findUnique({
      where: { id },
      select: recaladaSelect,
    });

    if (!item) {
      auditFail(
        req,
        "recaladas.getById.failed",
        "Get recalada failed",
        {
          reason: "not_found",
          recaladaId: id,
        },
        { entity: "Recalada", id: String(id) },
      );
      throw new NotFoundError("La recalada no existe");
    }

    logger.info({ recaladaId: id }, "[Recaladas] getById");

    auditOk(
      req,
      "recaladas.getById",
      "Recalada detail",
      {
        recaladaId: id,
        operationalStatus: item.operationalStatus,
        status: item.status,
      },
      { entity: "Recalada", id: String(id) },
    );

    return item;
  }

  /**
   * ✅ GET /recaladas/:id/atenciones
   * Devuelve las atenciones de una recalada para el tab de detalle.
   */
  static async getAtenciones(req: Request, recaladaId: number) {
    const recalada = await prisma.recalada.findUnique({
      where: { id: recaladaId },
      select: { id: true },
    });

    if (!recalada) {
      auditFail(
        req,
        "recaladas.getAtenciones.failed",
        "Get atenciones failed",
        {
          reason: "recalada_not_found",
          recaladaId,
        },
        { entity: "Recalada", id: String(recaladaId) },
      );
      throw new NotFoundError("La recalada no existe");
    }

    const items = await prisma.atencion.findMany({
      where: { recaladaId },
      select: atencionSelectForRecalada,
      orderBy: { fechaInicio: "asc" },
    });

    logger.info(
      { recaladaId, count: items.length },
      "[Recaladas] getAtenciones",
    );

    auditOk(
      req,
      "recaladas.getAtenciones",
      "Recalada atenciones",
      {
        recaladaId,
        count: items.length,
      },
      { entity: "Recalada", id: String(recaladaId) },
    );

    return items;
  }

  static async update(
    req: Request,
    id: number,
    input: UpdateRecaladaInput,
    actorUserId: string,
  ) {
    const current = await prisma.recalada.findUnique({
      where: { id },
      select: {
        id: true,
        operationalStatus: true,
        fechaLlegada: true,
        fechaSalida: true,
      },
    });

    if (!current) {
      auditFail(
        req,
        "recaladas.update.failed",
        "Update recalada failed",
        {
          reason: "not_found",
          recaladaId: id,
        },
        { entity: "Recalada", id: String(id) },
      );
      throw new NotFoundError("La recalada no existe");
    }

    if (
      current.operationalStatus === "DEPARTED" ||
      current.operationalStatus === "CANCELED"
    ) {
      auditFail(
        req,
        "recaladas.update.failed",
        "Update recalada failed",
        {
          reason: "invalid_operational_status",
          operationalStatus: current.operationalStatus,
          recaladaId: id,
        },
        { entity: "Recalada", id: String(id) },
      );
      throw new BadRequestError(
        "No se puede editar una recalada en estado DEPARTED o CANCELED",
      );
    }

    const allowedWhenScheduled = [
      "buqueId",
      "paisOrigenId",
      "fechaLlegada",
      "fechaSalida",
      "terminal",
      "muelle",
      "pasajerosEstimados",
      "tripulacionEstimada",
      "observaciones",
      "fuente",
    ];

    const allowedWhenArrived = [
      "fechaSalida",
      "terminal",
      "muelle",
      "pasajerosEstimados",
      "tripulacionEstimada",
      "observaciones",
    ];

    const allowed =
      current.operationalStatus === "SCHEDULED"
        ? allowedWhenScheduled
        : allowedWhenArrived;

    const dataRaw = pickAllowedFields(input as Record<string, any>, allowed);
    const data = normalizeNullableFields(dataRaw);

    if (Object.keys(data).length === 0) {
      auditFail(
        req,
        "recaladas.update.failed",
        "Update recalada failed",
        {
          reason: "no_allowed_fields",
          operationalStatus: current.operationalStatus,
          recaladaId: id,
        },
        { entity: "Recalada", id: String(id) },
      );
      throw new BadRequestError(
        "No hay campos permitidos para actualizar según el estado actual",
      );
    }

    if (data.buqueId) {
      const buque = await prisma.buque.findUnique({
        where: { id: data.buqueId },
        select: { id: true },
      });
      if (!buque) {
        auditFail(
          req,
          "recaladas.update.failed",
          "Update recalada failed",
          {
            reason: "buque_not_found",
            buqueId: data.buqueId,
            recaladaId: id,
          },
          { entity: "Recalada", id: String(id) },
        );
        throw new NotFoundError("El buque (buqueId) no existe");
      }
    }

    if (data.paisOrigenId) {
      const pais = await prisma.pais.findUnique({
        where: { id: data.paisOrigenId },
        select: { id: true },
      });
      if (!pais) {
        auditFail(
          req,
          "recaladas.update.failed",
          "Update recalada failed",
          {
            reason: "paisOrigen_not_found",
            paisOrigenId: data.paisOrigenId,
            recaladaId: id,
          },
          { entity: "Recalada", id: String(id) },
        );
        throw new NotFoundError("El país (paisOrigenId) no existe");
      }
    }

    const nextFechaLlegada: Date = data.fechaLlegada ?? current.fechaLlegada;
    const nextFechaSalida: Date | null =
      typeof data.fechaSalida !== "undefined"
        ? data.fechaSalida
        : current.fechaSalida;

    if (nextFechaSalida && nextFechaSalida < nextFechaLlegada) {
      auditFail(
        req,
        "recaladas.update.failed",
        "Update recalada failed",
        {
          reason: "fechaSalida_lt_fechaLlegada",
          recaladaId: id,
          nextFechaLlegada: nextFechaLlegada.toISOString(),
          nextFechaSalida: nextFechaSalida.toISOString(),
        },
        { entity: "Recalada", id: String(id) },
      );
      throw new BadRequestError("fechaSalida debe ser >= fechaLlegada");
    }

    if (typeof data.fechaSalida !== "undefined") {
      data.fechaSalida = data.fechaSalida ?? null;
    }

    const updated = await prisma.recalada.update({
      where: { id },
      data,
      select: recaladaSelect,
    });

    logger.info(
      {
        recaladaId: id,
        actorUserId,
        operationalStatus: current.operationalStatus,
        updatedKeys: Object.keys(data),
      },
      "[Recaladas] update",
    );

    auditOk(
      req,
      "recaladas.update.success",
      "Recalada updated",
      {
        actorUserId,
        recaladaId: id,
        operationalStatusBefore: current.operationalStatus,
        updatedKeys: Object.keys(data),
      },
      { entity: "Recalada", id: String(id) },
    );

    return updated;
  }

  static async arrive(
    req: Request,
    id: number,
    arrivedAt: Date | undefined,
    actorUserId: string,
  ) {
    const current = await prisma.recalada.findUnique({
      where: { id },
      select: { id: true, operationalStatus: true },
    });

    if (!current) {
      auditFail(
        req,
        "recaladas.arrive.failed",
        "Arrive recalada failed",
        {
          reason: "not_found",
          recaladaId: id,
        },
        { entity: "Recalada", id: String(id) },
      );
      throw new NotFoundError("La recalada no existe");
    }

    if (current.operationalStatus === "DEPARTED") {
      auditFail(
        req,
        "recaladas.arrive.failed",
        "Arrive recalada failed",
        {
          reason: "already_departed",
          recaladaId: id,
        },
        { entity: "Recalada", id: String(id) },
      );
      throw new BadRequestError(
        "No se puede marcar ARRIVED una recalada en estado DEPARTED",
      );
    }
    if (current.operationalStatus === "CANCELED") {
      auditFail(
        req,
        "recaladas.arrive.failed",
        "Arrive recalada failed",
        {
          reason: "canceled",
          recaladaId: id,
        },
        { entity: "Recalada", id: String(id) },
      );
      throw new BadRequestError(
        "No se puede marcar ARRIVED una recalada en estado CANCELED",
      );
    }
    if (current.operationalStatus !== "SCHEDULED") {
      auditFail(
        req,
        "recaladas.arrive.failed",
        "Arrive recalada failed",
        {
          reason: "invalid_state",
          operationalStatus: current.operationalStatus,
          recaladaId: id,
        },
        { entity: "Recalada", id: String(id) },
      );
      throw new BadRequestError(
        "Solo se puede marcar ARRIVED si la recalada está en SCHEDULED",
      );
    }

    const when = arrivedAt ?? new Date();

    const updated = await prisma.recalada.update({
      where: { id },
      data: {
        operationalStatus: "ARRIVED",
        arrivedAt: when,
        canceledAt: null,
        cancelReason: null,
      },
      select: recaladaSelect,
    });

    logger.info(
      { recaladaId: id, actorUserId, arrivedAt: when.toISOString() },
      "[Recaladas] arrive",
    );

    auditOk(
      req,
      "recaladas.arrive.success",
      "Recalada arrived",
      {
        actorUserId,
        recaladaId: id,
        arrivedAt: when.toISOString(),
      },
      { entity: "Recalada", id: String(id) },
    );

    return updated;
  }

  static async depart(
    req: Request,
    id: number,
    departedAt: Date | undefined,
    actorUserId: string,
  ) {
    const current = await prisma.recalada.findUnique({
      where: { id },
      select: { id: true, operationalStatus: true, arrivedAt: true },
    });

    if (!current) {
      auditFail(
        req,
        "recaladas.depart.failed",
        "Depart recalada failed",
        {
          reason: "not_found",
          recaladaId: id,
        },
        { entity: "Recalada", id: String(id) },
      );
      throw new NotFoundError("La recalada no existe");
    }

    if (current.operationalStatus === "CANCELED") {
      auditFail(
        req,
        "recaladas.depart.failed",
        "Depart recalada failed",
        {
          reason: "canceled",
          recaladaId: id,
        },
        { entity: "Recalada", id: String(id) },
      );
      throw new BadRequestError(
        "No se puede marcar DEPARTED una recalada en estado CANCELED",
      );
    }
    if (current.operationalStatus === "DEPARTED") {
      auditFail(
        req,
        "recaladas.depart.failed",
        "Depart recalada failed",
        {
          reason: "already_departed",
          recaladaId: id,
        },
        { entity: "Recalada", id: String(id) },
      );
      throw new BadRequestError("La recalada ya está en DEPARTED");
    }
    if (current.operationalStatus !== "ARRIVED") {
      auditFail(
        req,
        "recaladas.depart.failed",
        "Depart recalada failed",
        {
          reason: "invalid_state",
          operationalStatus: current.operationalStatus,
          recaladaId: id,
        },
        { entity: "Recalada", id: String(id) },
      );
      throw new BadRequestError(
        "Solo se puede marcar DEPARTED si la recalada está en ARRIVED",
      );
    }

    const when = departedAt ?? new Date();

    if (current.arrivedAt && when < current.arrivedAt) {
      auditFail(
        req,
        "recaladas.depart.failed",
        "Depart recalada failed",
        {
          reason: "departedAt_lt_arrivedAt",
          recaladaId: id,
          arrivedAt: current.arrivedAt.toISOString(),
          departedAt: when.toISOString(),
        },
        { entity: "Recalada", id: String(id) },
      );
      throw new BadRequestError("departedAt debe ser >= arrivedAt");
    }

    const updated = await prisma.recalada.update({
      where: { id },
      data: {
        operationalStatus: "DEPARTED",
        departedAt: when,
      },
      select: recaladaSelect,
    });

    logger.info(
      { recaladaId: id, actorUserId, departedAt: when.toISOString() },
      "[Recaladas] depart",
    );

    auditOk(
      req,
      "recaladas.depart.success",
      "Recalada departed",
      {
        actorUserId,
        recaladaId: id,
        departedAt: when.toISOString(),
      },
      { entity: "Recalada", id: String(id) },
    );

    return updated;
  }

  static async cancel(
    req: Request,
    id: number,
    reason: string | undefined,
    actorUserId: string,
    actorRol: RolType | undefined,
  ) {
    const current = await prisma.recalada.findUnique({
      where: { id },
      select: { id: true, operationalStatus: true },
    });

    if (!current) {
      auditFail(
        req,
        "recaladas.cancel.failed",
        "Cancel recalada failed",
        {
          reason: "not_found",
          recaladaId: id,
        },
        { entity: "Recalada", id: String(id) },
      );
      throw new NotFoundError("La recalada no existe");
    }

    if (current.operationalStatus === "DEPARTED") {
      auditFail(
        req,
        "recaladas.cancel.failed",
        "Cancel recalada failed",
        {
          reason: "already_departed",
          recaladaId: id,
        },
        { entity: "Recalada", id: String(id) },
      );
      throw new BadRequestError(
        "No se puede cancelar una recalada en estado DEPARTED",
      );
    }
    if (current.operationalStatus === "CANCELED") {
      auditFail(
        req,
        "recaladas.cancel.failed",
        "Cancel recalada failed",
        {
          reason: "already_canceled",
          recaladaId: id,
        },
        { entity: "Recalada", id: String(id) },
      );
      throw new BadRequestError("La recalada ya está en estado CANCELED");
    }

    if (current.operationalStatus === "ARRIVED") {
      if (!actorRol) {
        auditFail(
          req,
          "recaladas.cancel.failed",
          "Cancel recalada failed",
          {
            reason: "missing_actor_role",
            recaladaId: id,
          },
          { entity: "Recalada", id: String(id) },
        );
        throw new BadRequestError("No se pudo determinar el rol del usuario");
      }
      if (actorRol !== "SUPER_ADMIN") {
        auditFail(
          req,
          "recaladas.cancel.failed",
          "Cancel recalada failed",
          {
            reason: "role_not_allowed",
            required: "SUPER_ADMIN",
            actorRol,
            recaladaId: id,
          },
          { entity: "Recalada", id: String(id) },
        );
        throw new BadRequestError(
          "Solo SUPER_ADMIN puede cancelar una recalada que ya ARRIVED",
        );
      }
    }

    const [atencionesCount, turnosCount] = await Promise.all([
      prisma.atencion.count({ where: { recaladaId: id } }),
      prisma.turno.count({ where: { atencion: { recaladaId: id } } }),
    ]);

    if (atencionesCount > 0 || turnosCount > 0) {
      auditFail(
        req,
        "recaladas.cancel.failed",
        "Cancel recalada failed",
        {
          reason: "has_dependencies",
          recaladaId: id,
          atencionesCount,
          turnosCount,
        },
        { entity: "Recalada", id: String(id) },
      );
      throw new BadRequestError(
        "No se puede cancelar la recalada porque tiene atenciones/turnos asociados. Defina política de cascada (cancelar o bloquear) para habilitar esta acción.",
      );
    }

    const when = new Date();

    const updated = await prisma.recalada.update({
      where: { id },
      data: {
        operationalStatus: "CANCELED",
        canceledAt: when,
        cancelReason: reason ?? null,
      },
      select: recaladaSelect,
    });

    logger.info(
      {
        recaladaId: id,
        actorUserId,
        actorRol,
        canceledAt: when.toISOString(),
      },
      "[Recaladas] cancel",
    );

    auditOk(
      req,
      "recaladas.cancel.success",
      "Recalada canceled",
      {
        actorUserId,
        actorRol,
        recaladaId: id,
        canceledAt: when.toISOString(),
        cancelReason: reason ?? null,
      },
      { entity: "Recalada", id: String(id) },
    );

    return updated;
  }

  static async deleteSafe(req: Request, id: number, actorUserId: string) {
    const current = await prisma.recalada.findUnique({
      where: { id },
      select: { id: true, codigoRecalada: true, operationalStatus: true },
    });

    if (!current) {
      auditFail(
        req,
        "recaladas.deleteSafe.failed",
        "Delete recalada failed",
        {
          reason: "not_found",
          recaladaId: id,
        },
        { entity: "Recalada", id: String(id) },
      );
      throw new NotFoundError("La recalada no existe");
    }

    if (current.operationalStatus !== "SCHEDULED") {
      auditFail(
        req,
        "recaladas.deleteSafe.failed",
        "Delete recalada failed",
        {
          reason: "not_scheduled",
          operationalStatus: current.operationalStatus,
          recaladaId: id,
        },
        { entity: "Recalada", id: String(id) },
      );
      throw new BadRequestError(
        "No se puede eliminar físicamente una recalada que no esté en SCHEDULED. Use cancelación.",
      );
    }

    const atencionesCount = await prisma.atencion.count({
      where: { recaladaId: id },
    });
    if (atencionesCount > 0) {
      auditFail(
        req,
        "recaladas.deleteSafe.failed",
        "Delete recalada failed",
        {
          reason: "has_atenciones",
          recaladaId: id,
          atencionesCount,
        },
        { entity: "Recalada", id: String(id) },
      );
      throw new BadRequestError(
        "No se puede eliminar la recalada porque tiene atenciones asociadas. Use cancelación.",
      );
    }

    const turnosCount = await prisma.turno.count({
      where: { atencion: { recaladaId: id } },
    });
    if (turnosCount > 0) {
      auditFail(
        req,
        "recaladas.deleteSafe.failed",
        "Delete recalada failed",
        {
          reason: "has_turnos",
          recaladaId: id,
          turnosCount,
        },
        { entity: "Recalada", id: String(id) },
      );
      throw new BadRequestError(
        "No se puede eliminar la recalada porque tiene turnos asociados. Use cancelación.",
      );
    }

    await prisma.recalada.delete({ where: { id } });

    logger.info(
      { recaladaId: id, codigoRecalada: current.codigoRecalada, actorUserId },
      "[Recaladas] deleteSafe",
    );

    auditOk(
      req,
      "recaladas.deleteSafe.success",
      "Recalada deleted",
      {
        actorUserId,
        recaladaId: id,
        codigoRecalada: current.codigoRecalada,
      },
      { entity: "Recalada", id: String(id) },
    );

    return { deleted: true, id };
  }
}
