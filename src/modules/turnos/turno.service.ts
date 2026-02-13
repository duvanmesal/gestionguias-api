import { prisma } from "../../prisma/client";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  ForbiddenError,
} from "../../libs/errors";
import { logger } from "../../libs/logger";
import type {
  Prisma,
  RecaladaOperativeStatus,
  AtencionOperativeStatus,
  StatusType,
  RolType,
} from "@prisma/client";
import type { ListTurnosQuery, ListTurnosMeQuery } from "./turno.schemas";

const turnoSelect = {
  id: true,
  atencionId: true,
  guiaId: true,
  numero: true,
  status: true,

  fechaInicio: true,
  fechaFin: true,
  observaciones: true,

  checkInAt: true,
  checkOutAt: true,

  canceledAt: true,
  cancelReason: true,
  canceledById: true,

  createdById: true,
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

  atencion: {
    select: {
      id: true,
      recaladaId: true,
      status: true,
      operationalStatus: true,
      fechaInicio: true,
      fechaFin: true,
      recalada: {
        select: {
          id: true,
          codigoRecalada: true,
          status: true,
          operationalStatus: true,
        },
      },
    },
  },
} satisfies Prisma.TurnoSelect;

type OperativeGate = {
  atencion: { status: StatusType; operationalStatus: AtencionOperativeStatus };
  recalada: { status: StatusType; operationalStatus: RecaladaOperativeStatus };
};

function assertOperacionPermitida(gate: OperativeGate) {
  // Admin status (ACTIVO/INACTIVO)
  if (gate.recalada.status !== "ACTIVO") {
    throw new ConflictError("La recalada no está activa");
  }
  if (gate.atencion.status !== "ACTIVO") {
    throw new ConflictError("La atención no está activa");
  }

  // Operative status
  if (gate.recalada.operationalStatus === "CANCELED") {
    throw new ConflictError("La recalada está cancelada");
  }
  if (gate.recalada.operationalStatus === "DEPARTED") {
    throw new ConflictError("La recalada ya finalizó (DEPARTED)");
  }

  if (gate.atencion.operationalStatus === "CANCELED") {
    throw new ConflictError("La atención está cancelada");
  }
  if (gate.atencion.operationalStatus === "CLOSED") {
    throw new ConflictError("La atención está cerrada");
  }
}

/**
 * FIFO opcional para permitir check-in únicamente al “siguiente” turno por orden (numero).
 * Apagado por defecto para no bloquear operación mientras ajustas UX/flujo.
 */
const ENFORCE_FIFO_CHECKIN = false;

async function getActorGuiaIdOrThrow(actorUserId: string): Promise<string> {
  const guia = await prisma.guia.findFirst({
    where: { usuarioId: actorUserId },
    select: { id: true },
  });

  if (!guia) {
    throw new ConflictError(
      "El usuario autenticado no está asociado a un guía",
    );
  }

  return guia.id;
}

function buildNoShowObservacion(reason?: string): string {
  const base = "NO_SHOW";
  if (!reason?.trim()) return base;
  return `${base}: ${reason.trim()}`;
}

function buildDateOverlapAnd(
  dateFrom?: Date,
  dateTo?: Date,
): Prisma.TurnoWhereInput[] {
  const and: Prisma.TurnoWhereInput[] = [];

  if (dateFrom || dateTo) {
    and.push({ fechaInicio: { not: null } });
    and.push({ fechaFin: { not: null } });

    if (dateFrom) and.push({ fechaFin: { gte: dateFrom } });
    if (dateTo) and.push({ fechaInicio: { lte: dateTo } });
  }

  return and;
}

export class TurnoService {
  /**
   * GET /turnos
   * Lista global para panel con filtros + paginación
   */
  static async list(query: ListTurnosQuery) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    // Default: hoy si no mandan dateFrom/dateTo
    const hasAnyDate = !!query.dateFrom || !!query.dateTo;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const dateFrom = query.dateFrom ?? (hasAnyDate ? undefined : todayStart);
    const dateTo = query.dateTo ?? (hasAnyDate ? undefined : todayEnd);

    const where: Prisma.TurnoWhereInput = {
      ...(query.atencionId ? { atencionId: query.atencionId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(typeof query.assigned === "boolean"
        ? query.assigned
          ? { guiaId: { not: null } }
          : { guiaId: null }
        : {}),
      ...(query.recaladaId
        ? { atencion: { recaladaId: query.recaladaId } }
        : {}),
    };

    const and = buildDateOverlapAnd(dateFrom, dateTo);

    const finalWhere: Prisma.TurnoWhereInput =
      and.length > 0 ? { ...where, AND: and } : where;

    const [total, items] = await prisma.$transaction([
      prisma.turno.count({ where: finalWhere }),
      prisma.turno.findMany({
        where: finalWhere,
        select: turnoSelect,
        orderBy: [
          { fechaInicio: "asc" },
          { atencionId: "asc" },
          { numero: "asc" },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return {
      items,
      meta: {
        page,
        pageSize,
        total,
        totalPages,
      },
    };
  }

  /**
   * GET /turnos/me
   * Lista turnos del guía autenticado
   */
  static async listMe(actorUserId: string, query: ListTurnosMeQuery) {
    const actorGuiaId = await getActorGuiaIdOrThrow(actorUserId);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const hasAnyDate = !!query.dateFrom || !!query.dateTo;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const dateFrom = query.dateFrom ?? (hasAnyDate ? undefined : todayStart);
    const dateTo = query.dateTo ?? (hasAnyDate ? undefined : todayEnd);

    const where: Prisma.TurnoWhereInput = {
      guiaId: actorGuiaId,
      ...(query.atencionId ? { atencionId: query.atencionId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.recaladaId
        ? { atencion: { recaladaId: query.recaladaId } }
        : {}),
    };

    const and = buildDateOverlapAnd(dateFrom, dateTo);

    const finalWhere: Prisma.TurnoWhereInput =
      and.length > 0 ? { ...where, AND: and } : where;

    const [total, items] = await prisma.$transaction([
      prisma.turno.count({ where: finalWhere }),
      prisma.turno.findMany({
        where: finalWhere,
        select: turnoSelect,
        orderBy: [
          { fechaInicio: "asc" },
          { atencionId: "asc" },
          { numero: "asc" },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return {
      items,
      meta: { page, pageSize, total, totalPages },
    };
  }

  /**
   * GET /turnos/me/next
   * Próximo turno del guía autenticado (ASSIGNED o IN_PROGRESS)
   */
  static async getNextMe(actorUserId: string) {
    const actorGuiaId = await getActorGuiaIdOrThrow(actorUserId);

    const item = await prisma.turno.findFirst({
      where: {
        guiaId: actorGuiaId,
        status: { in: ["ASSIGNED", "IN_PROGRESS"] },
        fechaInicio: { not: null },
        fechaFin: { not: null },
      },
      select: turnoSelect,
      orderBy: [
        { fechaInicio: "asc" },
        { atencionId: "asc" },
        { numero: "asc" },
      ],
    });

    return item ?? null;
  }

  /**
   * GET /turnos/me/active
   * Turno activo (IN_PROGRESS) si existe
   */
  static async getActiveMe(actorUserId: string) {
    const actorGuiaId = await getActorGuiaIdOrThrow(actorUserId);

    const item = await prisma.turno.findFirst({
      where: {
        guiaId: actorGuiaId,
        status: "IN_PROGRESS",
      },
      select: turnoSelect,
      orderBy: [
        { fechaInicio: "asc" },
        { atencionId: "asc" },
        { numero: "asc" },
      ],
    });

    return item ?? null;
  }

  /**
   * GET /turnos/:id
   * Detalle (sin ACL)
   */
  static async getById(turnoId: number) {
    const item = await prisma.turno.findUnique({
      where: { id: turnoId },
      select: turnoSelect,
    });

    if (!item) throw new NotFoundError("Turno no encontrado");

    return item;
  }

  /**
   * GET /turnos/:id
   * Detalle (con ACL por actor)
   * - SUPERVISOR/SUPER_ADMIN: cualquiera
   * - GUIA: solo si turno.guiaId == miGuiaId
   */
  static async getByIdForActor(
    turnoId: number,
    actorUserId: string,
    actorRol: RolType,
  ) {
    const item = await this.getById(turnoId);

    if (actorRol === "GUIA") {
      const actorGuiaId = await getActorGuiaIdOrThrow(actorUserId);

      // Importante: si el turno no está asignado a ese guía, no puede verlo
      if (item.guiaId !== actorGuiaId) {
        throw new ForbiddenError("No tienes permisos para ver este turno");
      }
    }

    return item;
  }

  /**
   * POST /turnos/:id/claim
   * El guía toma un turno específico si está AVAILABLE.
   * Reglas:
   * - Turno debe estar AVAILABLE y guiaId = null
   * - Atención/Recalada deben permitir operación
   * - El guía NO debe tener otro turno en esa misma atención (unique atencionId+guiaId)
   */
  static async claim(turnoId: number, actorUserId: string) {
    const actorGuiaId = await getActorGuiaIdOrThrow(actorUserId);

    const current = await prisma.turno.findUnique({
      where: { id: turnoId },
      select: {
        id: true,
        atencionId: true,
        guiaId: true,
        status: true,
        atencion: {
          select: {
            status: true,
            operationalStatus: true,
            recalada: { select: { status: true, operationalStatus: true } },
          },
        },
      },
    });

    if (!current) throw new NotFoundError("Turno no encontrado");

    assertOperacionPermitida({
      atencion: {
        status: current.atencion.status,
        operationalStatus: current.atencion.operationalStatus,
      },
      recalada: {
        status: current.atencion.recalada.status,
        operationalStatus: current.atencion.recalada.operationalStatus,
      },
    });

    if (current.status !== "AVAILABLE" || current.guiaId !== null) {
      throw new ConflictError("El turno no está disponible para tomar");
    }

    // Conflicto explícito (mensaje limpio). Igual respaldado por @@unique(atencionId, guiaId)
    const existing = await prisma.turno.findFirst({
      where: {
        atencionId: current.atencionId,
        guiaId: actorGuiaId,
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictError("Ya tienes un turno asignado en esta atención");
    }

    try {
      const updated = await prisma.$transaction(async (tx) => {
        const result = await tx.turno.updateMany({
          where: {
            id: turnoId,
            status: "AVAILABLE",
            guiaId: null,
          },
          data: {
            guiaId: actorGuiaId,
            status: "ASSIGNED",
          },
        });

        if (result.count !== 1) {
          throw new ConflictError(
            "No fue posible tomar: el turno ya no está disponible",
          );
        }

        return tx.turno.findUnique({
          where: { id: turnoId },
          select: turnoSelect,
        });
      });

      if (!updated) throw new BadRequestError("No fue posible tomar el turno");

      logger.info(
        {
          turnoId,
          atencionId: updated.atencionId,
          guiaId: actorGuiaId,
          actorUserId,
        },
        "[Turnos] claimed",
      );

      return updated;
    } catch (err: any) {
      if (err?.code === "P2002") {
        throw new ConflictError("Ya tienes un turno asignado en esta atención");
      }
      throw err;
    }
  }

  /**
   * PATCH /turnos/:id/assign
   * Asignación controlada por supervisor.
   * Reglas:
   * - Turno debe estar AVAILABLE y guiaId = null
   * - Atención/Recalada deben permitir operación
   * - Si el guía ya tiene turno en esa atención -> conflicto (unique)
   */
  static async assign(turnoId: number, guiaId: string, actorUserId: string) {
    if (!guiaId?.trim()) {
      throw new BadRequestError("guiaId es requerido");
    }

    const guia = await prisma.guia.findUnique({
      where: { id: guiaId },
      select: { id: true },
    });
    if (!guia) {
      throw new NotFoundError("Guía no encontrado (guiaId)");
    }

    const current = await prisma.turno.findUnique({
      where: { id: turnoId },
      select: {
        id: true,
        atencionId: true,
        guiaId: true,
        status: true,
        atencion: {
          select: {
            status: true,
            operationalStatus: true,
            recalada: { select: { status: true, operationalStatus: true } },
          },
        },
      },
    });

    if (!current) throw new NotFoundError("Turno no encontrado");

    assertOperacionPermitida({
      atencion: {
        status: current.atencion.status,
        operationalStatus: current.atencion.operationalStatus,
      },
      recalada: {
        status: current.atencion.recalada.status,
        operationalStatus: current.atencion.recalada.operationalStatus,
      },
    });

    if (current.status !== "AVAILABLE" || current.guiaId !== null) {
      throw new ConflictError("El turno no está disponible para asignación");
    }

    const existing = await prisma.turno.findFirst({
      where: {
        atencionId: current.atencionId,
        guiaId,
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictError(
        "El guía ya tiene un turno asignado en esta atención",
      );
    }

    try {
      const updated = await prisma.$transaction(async (tx) => {
        const result = await tx.turno.updateMany({
          where: {
            id: turnoId,
            status: "AVAILABLE",
            guiaId: null,
          },
          data: {
            guiaId,
            status: "ASSIGNED",
          },
        });

        if (result.count !== 1) {
          throw new ConflictError(
            "No fue posible asignar: el turno ya no está disponible",
          );
        }

        return tx.turno.findUnique({
          where: { id: turnoId },
          select: turnoSelect,
        });
      });

      if (!updated)
        throw new BadRequestError("No fue posible asignar el turno");

      logger.info(
        { turnoId, atencionId: updated.atencionId, guiaId, actorUserId },
        "[Turnos] assigned",
      );

      return updated;
    } catch (err: any) {
      if (err?.code === "P2002") {
        throw new ConflictError(
          "El guía ya tiene un turno asignado en esta atención",
        );
      }
      throw err;
    }
  }

  /**
   * PATCH /turnos/:id/unassign
   */
  static async unassign(
    turnoId: number,
    reason: string | undefined,
    actorUserId: string,
  ) {
    const current = await prisma.turno.findUnique({
      where: { id: turnoId },
      select: {
        id: true,
        atencionId: true,
        guiaId: true,
        status: true,
      },
    });

    if (!current) throw new NotFoundError("Turno no encontrado");

    if (current.status === "IN_PROGRESS" || current.status === "COMPLETED") {
      throw new ConflictError(
        "No se puede desasignar un turno en progreso o completado",
      );
    }

    if (current.status !== "ASSIGNED") {
      throw new ConflictError(
        "Solo se puede desasignar un turno en estado ASSIGNED",
      );
    }

    const updated = await prisma.turno.update({
      where: { id: turnoId },
      data: {
        guiaId: null,
        status: "AVAILABLE",
      },
      select: turnoSelect,
    });

    logger.info(
      {
        turnoId,
        atencionId: updated.atencionId,
        prevGuiaId: current.guiaId,
        actorUserId,
        reason,
      },
      "[Turnos] unassigned",
    );

    return updated;
  }

  /**
   * PATCH /turnos/:id/check-in
   */
  static async checkIn(turnoId: number, actorUserId: string) {
    const actorGuiaId = await getActorGuiaIdOrThrow(actorUserId);

    const current = await prisma.turno.findUnique({
      where: { id: turnoId },
      select: {
        id: true,
        atencionId: true,
        guiaId: true,
        numero: true,
        status: true,
        checkInAt: true,
        atencion: {
          select: {
            status: true,
            operationalStatus: true,
            recalada: { select: { status: true, operationalStatus: true } },
          },
        },
      },
    });

    if (!current) throw new NotFoundError("Turno no encontrado");

    assertOperacionPermitida({
      atencion: {
        status: current.atencion.status,
        operationalStatus: current.atencion.operationalStatus,
      },
      recalada: {
        status: current.atencion.recalada.status,
        operationalStatus: current.atencion.recalada.operationalStatus,
      },
    });

    if (current.status !== "ASSIGNED") {
      throw new ConflictError(
        "Solo se puede hacer check-in si el turno está ASSIGNED",
      );
    }

    if (!current.guiaId) {
      throw new ConflictError("El turno no tiene guía asignado");
    }

    if (current.guiaId !== actorGuiaId) {
      throw new ConflictError(
        "No puedes hacer check-in en un turno asignado a otro guía",
      );
    }

    if (ENFORCE_FIFO_CHECKIN) {
      const prevPending = await prisma.turno.findFirst({
        where: {
          atencionId: current.atencionId,
          status: "ASSIGNED",
          numero: { lt: current.numero },
        },
        select: { id: true, numero: true },
        orderBy: { numero: "asc" },
      });

      if (prevPending) {
        throw new ConflictError(
          "No puedes hacer check-in aún: hay un turno anterior pendiente (FIFO)",
        );
      }
    }

    const now = new Date();

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.turno.updateMany({
        where: {
          id: turnoId,
          status: "ASSIGNED",
          guiaId: actorGuiaId,
        },
        data: {
          checkInAt: now,
          status: "IN_PROGRESS",
        },
      });

      if (result.count !== 1) {
        throw new ConflictError(
          "No fue posible hacer check-in: el turno ya no cumple condiciones",
        );
      }

      return tx.turno.findUnique({
        where: { id: turnoId },
        select: turnoSelect,
      });
    });

    if (!updated) throw new BadRequestError("No fue posible hacer check-in");

    logger.info(
      {
        turnoId,
        atencionId: updated.atencionId,
        guiaId: actorGuiaId,
        actorUserId,
      },
      "[Turnos] check-in",
    );

    return updated;
  }

  /**
   * PATCH /turnos/:id/check-out
   */
  static async checkOut(turnoId: number, actorUserId: string) {
    const actorGuiaId = await getActorGuiaIdOrThrow(actorUserId);

    const current = await prisma.turno.findUnique({
      where: { id: turnoId },
      select: {
        id: true,
        atencionId: true,
        guiaId: true,
        status: true,
        checkOutAt: true,
        atencion: {
          select: {
            status: true,
            operationalStatus: true,
            recalada: { select: { status: true, operationalStatus: true } },
          },
        },
      },
    });

    if (!current) throw new NotFoundError("Turno no encontrado");

    assertOperacionPermitida({
      atencion: {
        status: current.atencion.status,
        operationalStatus: current.atencion.operationalStatus,
      },
      recalada: {
        status: current.atencion.recalada.status,
        operationalStatus: current.atencion.recalada.operationalStatus,
      },
    });

    if (current.status !== "IN_PROGRESS") {
      throw new ConflictError(
        "Solo se puede hacer check-out si el turno está IN_PROGRESS",
      );
    }

    if (!current.guiaId) {
      throw new ConflictError("El turno no tiene guía asignado");
    }

    if (current.guiaId !== actorGuiaId) {
      throw new ConflictError(
        "No puedes hacer check-out en un turno asignado a otro guía",
      );
    }

    const now = new Date();

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.turno.updateMany({
        where: {
          id: turnoId,
          status: "IN_PROGRESS",
          guiaId: actorGuiaId,
        },
        data: {
          checkOutAt: now,
          status: "COMPLETED",
        },
      });

      if (result.count !== 1) {
        throw new ConflictError(
          "No fue posible hacer check-out: el turno ya no cumple condiciones",
        );
      }

      return tx.turno.findUnique({
        where: { id: turnoId },
        select: turnoSelect,
      });
    });

    if (!updated) throw new BadRequestError("No fue posible hacer check-out");

    logger.info(
      {
        turnoId,
        atencionId: updated.atencionId,
        guiaId: actorGuiaId,
        actorUserId,
      },
      "[Turnos] check-out",
    );

    return updated;
  }

  /**
   * PATCH /turnos/:id/no-show
   */
  static async noShow(
    turnoId: number,
    reason: string | undefined,
    actorUserId: string,
  ) {
    const current = await prisma.turno.findUnique({
      where: { id: turnoId },
      select: {
        id: true,
        atencionId: true,
        guiaId: true,
        status: true,
        observaciones: true,
        atencion: {
          select: {
            status: true,
            operationalStatus: true,
            recalada: { select: { status: true, operationalStatus: true } },
          },
        },
      },
    });

    if (!current) throw new NotFoundError("Turno no encontrado");

    assertOperacionPermitida({
      atencion: {
        status: current.atencion.status,
        operationalStatus: current.atencion.operationalStatus,
      },
      recalada: {
        status: current.atencion.recalada.status,
        operationalStatus: current.atencion.recalada.operationalStatus,
      },
    });

    if (current.status !== "ASSIGNED") {
      throw new ConflictError(
        "Solo se puede marcar NO_SHOW si el turno está ASSIGNED",
      );
    }

    const extra = buildNoShowObservacion(reason);
    const mergedObs = current.observaciones?.trim()
      ? `${current.observaciones.trim()} | ${extra}`
      : extra;

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.turno.updateMany({
        where: {
          id: turnoId,
          status: "ASSIGNED",
        },
        data: {
          status: "NO_SHOW",
          observaciones: mergedObs,
        },
      });

      if (result.count !== 1) {
        throw new ConflictError(
          "No fue posible marcar NO_SHOW: el turno ya no cumple condiciones",
        );
      }

      return tx.turno.findUnique({
        where: { id: turnoId },
        select: turnoSelect,
      });
    });

    if (!updated) throw new BadRequestError("No fue posible marcar NO_SHOW");

    logger.info(
      {
        turnoId,
        atencionId: updated.atencionId,
        guiaId: current.guiaId,
        actorUserId,
        reason,
      },
      "[Turnos] no-show",
    );

    return updated;
  }
}
