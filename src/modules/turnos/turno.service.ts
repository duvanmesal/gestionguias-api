import type { Request } from "express";
import { prisma } from "../../prisma/client";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  ForbiddenError,
} from "../../libs/errors";
import { logger } from "../../libs/logger";
import { logsService } from "../../libs/logs/logs.service";
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
        select: { id: true, email: true, nombres: true, apellidos: true },
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
  if (gate.recalada.status !== "ACTIVO")
    throw new ConflictError("La recalada no está activa");
  if (gate.atencion.status !== "ACTIVO")
    throw new ConflictError("La atención no está activa");

  if (gate.recalada.operationalStatus === "CANCELED")
    throw new ConflictError("La recalada está cancelada");
  if (gate.recalada.operationalStatus === "DEPARTED")
    throw new ConflictError("La recalada ya finalizó (DEPARTED)");

  if (gate.atencion.operationalStatus === "CANCELED")
    throw new ConflictError("La atención está cancelada");
  if (gate.atencion.operationalStatus === "CLOSED")
    throw new ConflictError("La atención está cerrada");
}

const ENFORCE_FIFO_CHECKIN = false;

function auditWarn(
  req: Request,
  event: string,
  message: string,
  meta?: Record<string, any>,
  target?: any,
) {
  logsService.audit(req, { event, level: "warn", message, meta, target });
}

function auditInfo(
  req: Request,
  event: string,
  message: string,
  meta?: Record<string, any>,
  target?: any,
) {
  logsService.audit(req, { event, message, meta, target });
}

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
  static async list(req: Request, query: ListTurnosQuery) {
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
      ...(query.atencionId ? { atencionId: query.atencionId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.guiaId ? { guiaId: query.guiaId } : {}),
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

    auditInfo(
      req,
      "turnos.list",
      "Turnos list",
      {
        page,
        pageSize,
        total,
        totalPages,
        filters: {
          atencionId: query.atencionId ?? null,
          recaladaId: query.recaladaId ?? null,
          status: query.status ?? null,
          guiaId: query.guiaId ?? null,
          assigned: typeof query.assigned === "boolean" ? query.assigned : null,
          dateFrom: dateFrom ? dateFrom.toISOString() : null,
          dateTo: dateTo ? dateTo.toISOString() : null,
        },
        returned: items.length,
      },
      { entity: "Turno" },
    );

    return { items, meta: { page, pageSize, total, totalPages } };
  }

  static async listMe(
    req: Request,
    actorUserId: string,
    query: ListTurnosMeQuery,
  ) {
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

    auditInfo(
      req,
      "turnos.listMe",
      "Turnos list for actor",
      {
        actorUserId,
        actorGuiaId,
        page,
        pageSize,
        total,
        totalPages,
        returned: items.length,
      },
      { entity: "Turno" },
    );

    return { items, meta: { page, pageSize, total, totalPages } };
  }

  static async getNextMe(req: Request, actorUserId: string) {
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

    auditInfo(
      req,
      "turnos.getNextMe",
      "Get next turno for actor",
      {
        actorUserId,
        actorGuiaId,
        found: !!item,
        turnoId: item?.id ?? null,
      },
      { entity: "Turno", id: item?.id ? String(item.id) : undefined },
    );

    return item ?? null;
  }

  static async getActiveMe(req: Request, actorUserId: string) {
    const actorGuiaId = await getActorGuiaIdOrThrow(actorUserId);

    const item = await prisma.turno.findFirst({
      where: { guiaId: actorGuiaId, status: "IN_PROGRESS" },
      select: turnoSelect,
      orderBy: [
        { fechaInicio: "asc" },
        { atencionId: "asc" },
        { numero: "asc" },
      ],
    });

    auditInfo(
      req,
      "turnos.getActiveMe",
      "Get active turno for actor",
      {
        actorUserId,
        actorGuiaId,
        found: !!item,
        turnoId: item?.id ?? null,
      },
      { entity: "Turno", id: item?.id ? String(item.id) : undefined },
    );

    return item ?? null;
  }

  static async getById(req: Request, turnoId: number) {
    const item = await prisma.turno.findUnique({
      where: { id: turnoId },
      select: turnoSelect,
    });
    if (!item) {
      auditWarn(
        req,
        "turnos.getById.failed",
        "Get turno failed",
        { reason: "not_found", turnoId },
        { entity: "Turno", id: String(turnoId) },
      );
      throw new NotFoundError("Turno no encontrado");
    }
    return item;
  }

  static async getByIdForActor(
    req: Request,
    turnoId: number,
    actorUserId: string,
    actorRol: RolType,
  ) {
    const item = await this.getById(req, turnoId);

    if (actorRol === "GUIA") {
      const actorGuiaId = await getActorGuiaIdOrThrow(actorUserId);
      if (item.guiaId !== actorGuiaId) {
        auditWarn(
          req,
          "turnos.getById.failed",
          "Forbidden turno access",
          {
            reason: "forbidden",
            turnoId,
            actorUserId,
            actorGuiaId,
          },
          { entity: "Turno", id: String(turnoId) },
        );
        throw new ForbiddenError("No tienes permisos para ver este turno");
      }
    }

    auditInfo(
      req,
      "turnos.getById.success",
      "Turno detail",
      {
        turnoId,
        actorUserId,
        actorRol,
        guiaId: item.guiaId,
        atencionId: item.atencionId,
        status: item.status,
      },
      { entity: "Turno", id: String(turnoId) },
    );

    return item;
  }

  static async claim(req: Request, turnoId: number, actorUserId: string) {
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
            recalada: {
              select: {
                status: true,
                operationalStatus: true,
                id: true,
                codigoRecalada: true,
              },
            },
          },
        },
      },
    });

    if (!current) {
      auditWarn(
        req,
        "turnos.claim.failed",
        "Claim turno failed",
        { reason: "not_found", turnoId },
        { entity: "Turno", id: String(turnoId) },
      );
      throw new NotFoundError("Turno no encontrado");
    }

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
      auditWarn(
        req,
        "turnos.claim.failed",
        "Claim turno failed",
        {
          reason: "not_available",
          turnoId,
          status: current.status,
          guiaId: current.guiaId,
        },
        { entity: "Turno", id: String(turnoId) },
      );
      throw new ConflictError("El turno no está disponible para tomar");
    }

    const existing = await prisma.turno.findFirst({
      where: { atencionId: current.atencionId, guiaId: actorGuiaId },
      select: { id: true },
    });

    if (existing) {
      auditWarn(
        req,
        "turnos.claim.failed",
        "Claim turno failed",
        {
          reason: "already_has_turno_in_atencion",
          turnoId,
          atencionId: current.atencionId,
          actorGuiaId,
        },
        { entity: "Turno", id: String(turnoId) },
      );
      throw new ConflictError("Ya tienes un turno asignado en esta atención");
    }

    try {
      const updated = await prisma.$transaction(async (tx) => {
        const result = await tx.turno.updateMany({
          where: { id: turnoId, status: "AVAILABLE", guiaId: null },
          data: { guiaId: actorGuiaId, status: "ASSIGNED" },
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

      auditInfo(
        req,
        "turnos.claim.success",
        "Turno claimed",
        {
          turnoId,
          atencionId: updated.atencionId,
          actorUserId,
          actorGuiaId,
          status: updated.status,
          recaladaId: updated.atencion.recaladaId,
          codigoRecalada: updated.atencion.recalada.codigoRecalada,
        },
        { entity: "Turno", id: String(turnoId) },
      );

      return updated;
    } catch (err: any) {
      if (err?.code === "P2002") {
        auditWarn(
          req,
          "turnos.claim.failed",
          "Claim turno failed",
          { reason: "unique_conflict", turnoId, actorGuiaId },
          { entity: "Turno", id: String(turnoId) },
        );
        throw new ConflictError("Ya tienes un turno asignado en esta atención");
      }
      throw err;
    }
  }

  static async assign(
    req: Request,
    turnoId: number,
    guiaId: string,
    actorUserId: string,
  ) {
    if (!guiaId?.trim()) {
      auditWarn(
        req,
        "turnos.assign.failed",
        "Assign turno failed",
        { reason: "missing_guiaId", turnoId },
        { entity: "Turno", id: String(turnoId) },
      );
      throw new BadRequestError("guiaId es requerido");
    }

    const guia = await prisma.guia.findUnique({
      where: { id: guiaId },
      select: { id: true },
    });
    if (!guia) {
      auditWarn(
        req,
        "turnos.assign.failed",
        "Assign turno failed",
        { reason: "guia_not_found", guiaId, turnoId },
        { entity: "Guia", id: guiaId },
      );
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
            recalada: {
              select: {
                status: true,
                operationalStatus: true,
                id: true,
                codigoRecalada: true,
              },
            },
          },
        },
      },
    });

    if (!current) {
      auditWarn(
        req,
        "turnos.assign.failed",
        "Assign turno failed",
        { reason: "not_found", turnoId },
        { entity: "Turno", id: String(turnoId) },
      );
      throw new NotFoundError("Turno no encontrado");
    }

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
      auditWarn(
        req,
        "turnos.assign.failed",
        "Assign turno failed",
        {
          reason: "not_available",
          turnoId,
          status: current.status,
          guiaId: current.guiaId,
        },
        { entity: "Turno", id: String(turnoId) },
      );
      throw new ConflictError("El turno no está disponible para asignación");
    }

    const existing = await prisma.turno.findFirst({
      where: { atencionId: current.atencionId, guiaId },
      select: { id: true },
    });

    if (existing) {
      auditWarn(
        req,
        "turnos.assign.failed",
        "Assign turno failed",
        {
          reason: "guia_already_has_turno_in_atencion",
          turnoId,
          atencionId: current.atencionId,
          guiaId,
        },
        { entity: "Turno", id: String(turnoId) },
      );
      throw new ConflictError(
        "El guía ya tiene un turno asignado en esta atención",
      );
    }

    try {
      const updated = await prisma.$transaction(async (tx) => {
        const result = await tx.turno.updateMany({
          where: { id: turnoId, status: "AVAILABLE", guiaId: null },
          data: { guiaId, status: "ASSIGNED" },
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

      auditInfo(
        req,
        "turnos.assign.success",
        "Turno assigned",
        {
          turnoId,
          atencionId: updated.atencionId,
          guiaId,
          actorUserId,
          status: updated.status,
          recaladaId: updated.atencion.recaladaId,
          codigoRecalada: updated.atencion.recalada.codigoRecalada,
        },
        { entity: "Turno", id: String(turnoId) },
      );

      return updated;
    } catch (err: any) {
      if (err?.code === "P2002") {
        auditWarn(
          req,
          "turnos.assign.failed",
          "Assign turno failed",
          { reason: "unique_conflict", turnoId, guiaId },
          { entity: "Turno", id: String(turnoId) },
        );
        throw new ConflictError(
          "El guía ya tiene un turno asignado en esta atención",
        );
      }
      throw err;
    }
  }

  static async unassign(
    req: Request,
    turnoId: number,
    reason: string | undefined,
    actorUserId: string,
  ) {
    const current = await prisma.turno.findUnique({
      where: { id: turnoId },
      select: { id: true, atencionId: true, guiaId: true, status: true },
    });

    if (!current) {
      auditWarn(
        req,
        "turnos.unassign.failed",
        "Unassign turno failed",
        { reason: "not_found", turnoId },
        { entity: "Turno", id: String(turnoId) },
      );
      throw new NotFoundError("Turno no encontrado");
    }

    if (current.status === "IN_PROGRESS" || current.status === "COMPLETED") {
      auditWarn(
        req,
        "turnos.unassign.failed",
        "Unassign turno failed",
        { reason: "invalid_status", turnoId, status: current.status },
        { entity: "Turno", id: String(turnoId) },
      );
      throw new ConflictError(
        "No se puede desasignar un turno en progreso o completado",
      );
    }

    if (current.status !== "ASSIGNED") {
      auditWarn(
        req,
        "turnos.unassign.failed",
        "Unassign turno failed",
        { reason: "not_assigned", turnoId, status: current.status },
        { entity: "Turno", id: String(turnoId) },
      );
      throw new ConflictError(
        "Solo se puede desasignar un turno en estado ASSIGNED",
      );
    }

    const updated = await prisma.turno.update({
      where: { id: turnoId },
      data: { guiaId: null, status: "AVAILABLE" },
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

    auditInfo(
      req,
      "turnos.unassign.success",
      "Turno unassigned",
      {
        turnoId,
        atencionId: updated.atencionId,
        prevGuiaId: current.guiaId,
        actorUserId,
        reason: reason ?? null,
      },
      { entity: "Turno", id: String(turnoId) },
    );

    return updated;
  }

  static async cancel(
    req: Request,
    turnoId: number,
    cancelReason: string | undefined,
    actorUserId: string,
  ) {
    const current = await prisma.turno.findUnique({
      where: { id: turnoId },
      select: {
        id: true,
        atencionId: true,
        guiaId: true,
        status: true,
        canceledAt: true,
      },
    });

    if (!current) {
      auditWarn(
        req,
        "turnos.cancel.failed",
        "Cancel turno failed",
        { reason: "not_found", turnoId },
        { entity: "Turno", id: String(turnoId) },
      );
      throw new NotFoundError("Turno no encontrado");
    }

    if (current.status === "COMPLETED") {
      auditWarn(
        req,
        "turnos.cancel.failed",
        "Cancel turno failed",
        { reason: "completed", turnoId },
        { entity: "Turno", id: String(turnoId) },
      );
      throw new ConflictError("No se puede cancelar un turno completado");
    }
    if (current.status === "IN_PROGRESS") {
      auditWarn(
        req,
        "turnos.cancel.failed",
        "Cancel turno failed",
        { reason: "in_progress", turnoId },
        { entity: "Turno", id: String(turnoId) },
      );
      throw new ConflictError("No se puede cancelar un turno en progreso");
    }
    if (current.status === "CANCELED") {
      auditWarn(
        req,
        "turnos.cancel.failed",
        "Cancel turno failed",
        { reason: "already_canceled", turnoId },
        { entity: "Turno", id: String(turnoId) },
      );
      throw new ConflictError("El turno ya está cancelado");
    }

    const now = new Date();

    const updated = await prisma.turno.update({
      where: { id: turnoId },
      data: {
        status: "CANCELED",
        canceledAt: now,
        cancelReason: cancelReason?.trim() ? cancelReason.trim() : null,
        canceledById: actorUserId,
      },
      select: turnoSelect,
    });

    logger.info(
      {
        turnoId,
        atencionId: updated.atencionId,
        guiaId: updated.guiaId,
        actorUserId,
        cancelReason,
      },
      "[Turnos] canceled",
    );

    auditInfo(
      req,
      "turnos.cancel.success",
      "Turno canceled",
      {
        turnoId,
        atencionId: updated.atencionId,
        guiaId: updated.guiaId,
        actorUserId,
        cancelReason: cancelReason?.trim() ? cancelReason.trim() : null,
        canceledAt: now.toISOString(),
      },
      { entity: "Turno", id: String(turnoId) },
    );

    return updated;
  }

  static async checkIn(req: Request, turnoId: number, actorUserId: string) {
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

    if (!current) {
      auditWarn(
        req,
        "turnos.checkin.failed",
        "Check-in failed",
        { reason: "not_found", turnoId },
        { entity: "Turno", id: String(turnoId) },
      );
      throw new NotFoundError("Turno no encontrado");
    }

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
      auditWarn(
        req,
        "turnos.checkin.failed",
        "Check-in failed",
        { reason: "invalid_status", turnoId, status: current.status },
        { entity: "Turno", id: String(turnoId) },
      );
      throw new ConflictError(
        "Solo se puede hacer check-in si el turno está ASSIGNED",
      );
    }

    if (!current.guiaId) {
      auditWarn(
        req,
        "turnos.checkin.failed",
        "Check-in failed",
        { reason: "no_guia", turnoId },
        { entity: "Turno", id: String(turnoId) },
      );
      throw new ConflictError("El turno no tiene guía asignado");
    }

    if (current.guiaId !== actorGuiaId) {
      auditWarn(
        req,
        "turnos.checkin.failed",
        "Check-in failed",
        {
          reason: "guia_mismatch",
          turnoId,
          actorGuiaId,
          turnoGuiaId: current.guiaId,
        },
        { entity: "Turno", id: String(turnoId) },
      );
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
        auditWarn(
          req,
          "turnos.checkin.failed",
          "Check-in failed",
          {
            reason: "fifo_blocked",
            turnoId,
            prevPendingNumero: prevPending.numero,
          },
          { entity: "Turno", id: String(turnoId) },
        );
        throw new ConflictError(
          "No puedes hacer check-in aún: hay un turno anterior pendiente (FIFO)",
        );
      }
    }

    const now = new Date();

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.turno.updateMany({
        where: { id: turnoId, status: "ASSIGNED", guiaId: actorGuiaId },
        data: { checkInAt: now, status: "IN_PROGRESS" },
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

    auditInfo(
      req,
      "turnos.checkin.success",
      "Turno check-in",
      {
        turnoId,
        atencionId: updated.atencionId,
        guiaId: actorGuiaId,
        actorUserId,
        checkInAt: now.toISOString(),
        status: updated.status,
      },
      { entity: "Turno", id: String(turnoId) },
    );

    return updated;
  }

  static async checkOut(req: Request, turnoId: number, actorUserId: string) {
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

    if (!current) {
      auditWarn(
        req,
        "turnos.checkout.failed",
        "Check-out failed",
        { reason: "not_found", turnoId },
        { entity: "Turno", id: String(turnoId) },
      );
      throw new NotFoundError("Turno no encontrado");
    }

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
      auditWarn(
        req,
        "turnos.checkout.failed",
        "Check-out failed",
        { reason: "invalid_status", turnoId, status: current.status },
        { entity: "Turno", id: String(turnoId) },
      );
      throw new ConflictError(
        "Solo se puede hacer check-out si el turno está IN_PROGRESS",
      );
    }

    if (!current.guiaId) {
      auditWarn(
        req,
        "turnos.checkout.failed",
        "Check-out failed",
        { reason: "no_guia", turnoId },
        { entity: "Turno", id: String(turnoId) },
      );
      throw new ConflictError("El turno no tiene guía asignado");
    }

    if (current.guiaId !== actorGuiaId) {
      auditWarn(
        req,
        "turnos.checkout.failed",
        "Check-out failed",
        {
          reason: "guia_mismatch",
          turnoId,
          actorGuiaId,
          turnoGuiaId: current.guiaId,
        },
        { entity: "Turno", id: String(turnoId) },
      );
      throw new ConflictError(
        "No puedes hacer check-out en un turno asignado a otro guía",
      );
    }

    const now = new Date();

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.turno.updateMany({
        where: { id: turnoId, status: "IN_PROGRESS", guiaId: actorGuiaId },
        data: { checkOutAt: now, status: "COMPLETED" },
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

    auditInfo(
      req,
      "turnos.checkout.success",
      "Turno check-out",
      {
        turnoId,
        atencionId: updated.atencionId,
        guiaId: actorGuiaId,
        actorUserId,
        checkOutAt: now.toISOString(),
        status: updated.status,
      },
      { entity: "Turno", id: String(turnoId) },
    );

    return updated;
  }

  static async noShow(
    req: Request,
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
            recalada: {
              select: {
                status: true,
                operationalStatus: true,
                id: true,
                codigoRecalada: true,
              },
            },
          },
        },
      },
    });

    if (!current) {
      auditWarn(
        req,
        "turnos.noShow.failed",
        "NO_SHOW failed",
        { reason: "not_found", turnoId },
        { entity: "Turno", id: String(turnoId) },
      );
      throw new NotFoundError("Turno no encontrado");
    }

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
      auditWarn(
        req,
        "turnos.noShow.failed",
        "NO_SHOW failed",
        { reason: "invalid_status", turnoId, status: current.status },
        { entity: "Turno", id: String(turnoId) },
      );
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
        where: { id: turnoId, status: "ASSIGNED" },
        data: { status: "NO_SHOW", observaciones: mergedObs },
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

    auditInfo(
      req,
      "turnos.noShow.success",
      "Turno NO_SHOW",
      {
        turnoId,
        atencionId: updated.atencionId,
        actorUserId,
        reason: reason?.trim() ? reason.trim() : null,
        status: updated.status,
        recaladaId: updated.atencion.recaladaId,
        codigoRecalada: updated.atencion.recalada.codigoRecalada,
      },
      { entity: "Turno", id: String(turnoId) },
    );

    return updated;
  }
}
