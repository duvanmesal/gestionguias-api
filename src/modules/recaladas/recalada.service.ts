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
import type { ListRecaladasQuery, UpdateRecaladaBody } from "./recalada.schemas";

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
  // Convierte undefined -> (no tocar) ; deja valores concretos igual.
  // Para campos nullable en Prisma, si quieres permitir "limpiar" campo,
  // el front debería mandar null explícito.
  // Como el schema actual no permite null, aquí no transformamos a null.
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

      const codigoFinal = buildCodigoRecalada(recalada.fechaLlegada, recalada.id);

      const updated = await tx.recalada.update({
        where: { id: recalada.id },
        data: { codigoRecalada: codigoFinal },
        select: recaladaSelect,
      });

      return updated;
    });

    logger.info(
      { recaladaId: created.id, codigoRecalada: created.codigoRecalada, actorUserId },
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
    if (query.operationalStatus) AND.push({ operationalStatus: query.operationalStatus });
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

    return { items, meta };
  }

  /**
   * GET /recaladas/:id
   * Trae el detalle completo de una recalada para vista de detalle y acciones operativas.
   */
  static async getById(id: number) {
    const item = await prisma.recalada.findUnique({
      where: { id },
      select: recaladaSelect,
    });

    if (!item) {
      throw new NotFoundError("La recalada no existe");
    }

    logger.info({ recaladaId: id }, "[Recaladas] getById");

    return item;
  }

  /**
   * ✅ PATCH /recaladas/:id
   * Edita una recalada en forma parcial.
   *
   * Reglas clave por operationalStatus:
   * - SCHEDULED: permite editar casi todo (de lo que expone el schema)
   * - ARRIVED: edición limitada
   * - DEPARTED o CANCELED: bloqueado
   */
  static async update(id: number, input: UpdateRecaladaInput, actorUserId: string) {
    // 1) Traer estado actual + datos necesarios para validar fechas con parciales
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
      throw new NotFoundError("La recalada no existe");
    }

    // 2) Regla: bloquear si ya finalizó
    if (current.operationalStatus === "DEPARTED" || current.operationalStatus === "CANCELED") {
      throw new BadRequestError("No se puede editar una recalada en estado DEPARTED o CANCELED");
    }

    // 3) Determinar campos permitidos según estado
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

    // ARRIVED: edición limitada (puerto/operación ya pasó parcialmente)
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
      throw new BadRequestError("No hay campos permitidos para actualizar según el estado actual");
    }

    // 4) Validaciones extra de integridad (si cambian ids)
    if (data.buqueId) {
      const buque = await prisma.buque.findUnique({
        where: { id: data.buqueId },
        select: { id: true },
      });
      if (!buque) throw new NotFoundError("El buque (buqueId) no existe");
    }

    if (data.paisOrigenId) {
      const pais = await prisma.pais.findUnique({
        where: { id: data.paisOrigenId },
        select: { id: true },
      });
      if (!pais) throw new NotFoundError("El país (paisOrigenId) no existe");
    }

    // 5) Validación de fechas usando mezcla (parcial + valores actuales)
    const nextFechaLlegada: Date = data.fechaLlegada ?? current.fechaLlegada;
    const nextFechaSalida: Date | null =
      typeof data.fechaSalida !== "undefined" ? data.fechaSalida : current.fechaSalida;

    if (nextFechaSalida && nextFechaSalida < nextFechaLlegada) {
      throw new BadRequestError("fechaSalida debe ser >= fechaLlegada");
    }

    // Prisma nullable: fechaSalida se guarda como null si no viene o si es null.
    // Como el schema de PATCH no permite null, solo actualizamos si viene.
    if (typeof data.fechaSalida !== "undefined") {
      data.fechaSalida = data.fechaSalida ?? null;
    }

    // 6) Update + retorno completo (misma forma del create/getById/list)
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

    return updated;
  }

  /**
   * ✅ PATCH /recaladas/:id/arrive
   * Marca recalada como ARRIVED y guarda arrivedAt.
   *
   * Reglas:
   * - Solo permitido si operationalStatus = SCHEDULED
   * - Si body.arrivedAt no viene: now()
   */
  static async arrive(id: number, arrivedAt: Date | undefined, actorUserId: string) {
    const current = await prisma.recalada.findUnique({
      where: { id },
      select: {
        id: true,
        operationalStatus: true,
      },
    });

    if (!current) throw new NotFoundError("La recalada no existe");

    if (current.operationalStatus === "DEPARTED") {
      throw new BadRequestError("No se puede marcar ARRIVED una recalada en estado DEPARTED");
    }
    if (current.operationalStatus === "CANCELED") {
      throw new BadRequestError("No se puede marcar ARRIVED una recalada en estado CANCELED");
    }
    if (current.operationalStatus !== "SCHEDULED") {
      throw new BadRequestError("Solo se puede marcar ARRIVED si la recalada está en SCHEDULED");
    }

    const when = arrivedAt ?? new Date();

    const updated = await prisma.recalada.update({
      where: { id },
      data: {
        operationalStatus: "ARRIVED",
        arrivedAt: when,
        // si venía de algo raro (por seguridad), limpiamos auditoría de cancelación
        canceledAt: null,
        cancelReason: null,
      },
      select: recaladaSelect,
    });

    logger.info(
      { recaladaId: id, actorUserId, arrivedAt: when.toISOString() },
      "[Recaladas] arrive",
    );

    return updated;
  }

  /**
   * ✅ PATCH /recaladas/:id/depart
   * Marca recalada como DEPARTED y guarda departedAt.
   *
   * Reglas:
   * - Solo permitido si operationalStatus = ARRIVED
   * - Si body.departedAt no viene: now()
   */
  static async depart(id: number, departedAt: Date | undefined, actorUserId: string) {
    const current = await prisma.recalada.findUnique({
      where: { id },
      select: {
        id: true,
        operationalStatus: true,
        arrivedAt: true,
      },
    });

    if (!current) throw new NotFoundError("La recalada no existe");

    if (current.operationalStatus === "CANCELED") {
      throw new BadRequestError("No se puede marcar DEPARTED una recalada en estado CANCELED");
    }
    if (current.operationalStatus === "DEPARTED") {
      throw new BadRequestError("La recalada ya está en DEPARTED");
    }
    if (current.operationalStatus !== "ARRIVED") {
      throw new BadRequestError("Solo se puede marcar DEPARTED si la recalada está en ARRIVED");
    }

    const when = departedAt ?? new Date();

    if (current.arrivedAt && when < current.arrivedAt) {
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

    return updated;
  }

  /**
   * ✅ PATCH /recaladas/:id/cancel
   * Marca recalada como CANCELED y setea canceledAt + cancelReason.
   *
   * Reglas:
   * - No se puede cancelar si ya está DEPARTED o CANCELED
   * - Si está ARRIVED: permitir solo SUPER_ADMIN (si aplicamos esa regla)
   * - Si existen Atenciones/Turnos: por ahora bloqueamos (hasta definir cascada)
   */
  static async cancel(
    id: number,
    reason: string | undefined,
    actorUserId: string,
    actorRol: RolType | undefined,
  ) {
    const current = await prisma.recalada.findUnique({
      where: { id },
      select: {
        id: true,
        operationalStatus: true,
      },
    });

    if (!current) throw new NotFoundError("La recalada no existe");

    if (current.operationalStatus === "DEPARTED") {
      throw new BadRequestError("No se puede cancelar una recalada en estado DEPARTED");
    }
    if (current.operationalStatus === "CANCELED") {
      throw new BadRequestError("La recalada ya está en estado CANCELED");
    }

    // Regla especial: si ya está ARRIVED solo SUPER_ADMIN
    if (current.operationalStatus === "ARRIVED") {
      if (!actorRol) {
        throw new BadRequestError("No se pudo determinar el rol del usuario");
      }
      if (actorRol !== "SUPER_ADMIN") {
        throw new BadRequestError("Solo SUPER_ADMIN puede cancelar una recalada que ya ARRIVED");
      }
    }

    // Dependencias (por ahora bloqueamos hasta definir cascada)
    const [atencionesCount, turnosCount] = await Promise.all([
      prisma.atencion.count({ where: { recaladaId: id } }),
      prisma.turno.count({ where: { atencion: { recaladaId: id } } }),
    ]);

    if (atencionesCount > 0 || turnosCount > 0) {
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

    return updated;
  }

  /**
   * ✅ DELETE /recaladas/:id
   * Elimina físicamente una recalada SOLO si es "safe"
   *
   * Reglas:
   * - Idealmente solo si operationalStatus = SCHEDULED
   * - No debe tener atenciones ni turnos relacionados
   * - Si tiene dependencias: usar cancelación, no delete
   */
  static async deleteSafe(id: number, actorUserId: string) {
    // 1) Existe?
    const current = await prisma.recalada.findUnique({
      where: { id },
      select: {
        id: true,
        codigoRecalada: true,
        operationalStatus: true,
      },
    });

    if (!current) {
      throw new NotFoundError("La recalada no existe");
    }

    // 2) Idealmente SOLO si está SCHEDULED
    if (current.operationalStatus !== "SCHEDULED") {
      throw new BadRequestError(
        "No se puede eliminar físicamente una recalada que no esté en SCHEDULED. Use cancelación.",
      );
    }

    // 3) Validar dependencias
    // Atenciones directas
    const atencionesCount = await prisma.atencion.count({
      where: { recaladaId: id },
    });

    if (atencionesCount > 0) {
      throw new BadRequestError(
        "No se puede eliminar la recalada porque tiene atenciones asociadas. Use cancelación.",
      );
    }

    // Turnos indirectos (si existen vía Atencion)
    const turnosCount = await prisma.turno.count({
      where: { atencion: { recaladaId: id } },
    });

    if (turnosCount > 0) {
      throw new BadRequestError(
        "No se puede eliminar la recalada porque tiene turnos asociados. Use cancelación.",
      );
    }

    // 4) Delete físico
    await prisma.recalada.delete({
      where: { id },
    });

    logger.info(
      {
        recaladaId: id,
        codigoRecalada: current.codigoRecalada,
        actorUserId,
      },
      "[Recaladas] deleteSafe",
    );

    return { deleted: true, id };
  }
}
