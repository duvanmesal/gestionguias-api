import { prisma } from "../../prisma/client";
import { BadRequestError, ConflictError, NotFoundError } from "../../libs/errors";
import { logger } from "../../libs/logger";
import type {
  Prisma,
  RecaladaOperativeStatus,
  AtencionOperativeStatus,
  StatusType,
} from "@prisma/client";

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
    throw new ConflictError("El usuario autenticado no está asociado a un guía");
  }

  return guia.id;
}

function buildNoShowObservacion(reason?: string): string {
  const base = "NO_SHOW";
  if (!reason?.trim()) return base;
  return `${base}: ${reason.trim()}`;
}

export class TurnoService {
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

    // Validar que exista el guía
    const guia = await prisma.guia.findUnique({
      where: { id: guiaId },
      select: { id: true },
    });
    if (!guia) {
      throw new NotFoundError("Guía no encontrado (guiaId)");
    }

    // Pre-cargar turno + gate operativo
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

    // Conflicto explícito (mensaje limpio). Igual está respaldado por @@unique(atencionId, guiaId)
    const existing = await prisma.turno.findFirst({
      where: {
        atencionId: current.atencionId,
        guiaId,
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictError("El guía ya tiene un turno asignado en esta atención");
    }

    try {
      const updated = await prisma.$transaction(async (tx) => {
        // update condicional (anti-carreras): solo si sigue AVAILABLE y guiaId=null
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
          throw new ConflictError("No fue posible asignar: el turno ya no está disponible");
        }

        return tx.turno.findUnique({
          where: { id: turnoId },
          select: turnoSelect,
        });
      });

      if (!updated) throw new BadRequestError("No fue posible asignar el turno");

      logger.info(
        { turnoId, atencionId: updated.atencionId, guiaId, actorUserId },
        "[Turnos] assigned",
      );

      return updated;
    } catch (err: any) {
      // Respaldo por si explota @@unique([atencionId, guiaId])
      if (err?.code === "P2002") {
        throw new ConflictError("El guía ya tiene un turno asignado en esta atención");
      }
      throw err;
    }
  }

  /**
   * PATCH /turnos/:id/unassign
   * Reglas:
   * - Solo si turno está ASSIGNED
   * - NO permitir si IN_PROGRESS o COMPLETED
   * - Set guiaId=null, status=AVAILABLE
   * - Auditoría por logs + reason (si aplica)
   */
  static async unassign(turnoId: number, reason: string | undefined, actorUserId: string) {
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
      throw new ConflictError("No se puede desasignar un turno en progreso o completado");
    }

    if (current.status !== "ASSIGNED") {
      throw new ConflictError("Solo se puede desasignar un turno en estado ASSIGNED");
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
   * Reglas:
   * - Solo si status = ASSIGNED
   * - Solo el guía asignado (usuario autenticado -> guiaId) puede hacer check-in
   * - checkInAt = now()
   * - status = IN_PROGRESS
   * - Opcional FIFO (enforce por numero dentro de la misma atención)
   */
  static async checkIn(turnoId: number, actorUserId: string) {
    const actorGuiaId = await getActorGuiaIdOrThrow(actorUserId);

    // Cargar turno + gate operativo
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
      throw new ConflictError("Solo se puede hacer check-in si el turno está ASSIGNED");
    }

    if (!current.guiaId) {
      throw new ConflictError("El turno no tiene guía asignado");
    }

    if (current.guiaId !== actorGuiaId) {
      throw new ConflictError("No puedes hacer check-in en un turno asignado a otro guía");
    }

    if (ENFORCE_FIFO_CHECKIN) {
      const prevPending = await prisma.turno.findFirst({
        where: {
          atencionId: current.atencionId,
          status: "ASSIGNED",
          // “antes” en orden
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
      // anti-carreras: solo si sigue ASSIGNED y sigue siendo del mismo guía
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
        throw new ConflictError("No fue posible hacer check-in: el turno ya no cumple condiciones");
      }

      return tx.turno.findUnique({
        where: { id: turnoId },
        select: turnoSelect,
      });
    });

    if (!updated) throw new BadRequestError("No fue posible hacer check-in");

    logger.info(
      { turnoId, atencionId: updated.atencionId, guiaId: actorGuiaId, actorUserId },
      "[Turnos] check-in",
    );

    return updated;
  }

  /**
   * PATCH /turnos/:id/check-out
   * Reglas:
   * - Solo si status = IN_PROGRESS
   * - Solo el guía asignado puede hacer check-out
   * - checkOutAt = now()
   * - status = COMPLETED
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
      throw new ConflictError("Solo se puede hacer check-out si el turno está IN_PROGRESS");
    }

    if (!current.guiaId) {
      throw new ConflictError("El turno no tiene guía asignado");
    }

    if (current.guiaId !== actorGuiaId) {
      throw new ConflictError("No puedes hacer check-out en un turno asignado a otro guía");
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
      { turnoId, atencionId: updated.atencionId, guiaId: actorGuiaId, actorUserId },
      "[Turnos] check-out",
    );

    return updated;
  }

  /**
   * PATCH /turnos/:id/no-show
   * Reglas:
   * - Solo si status = ASSIGNED
   * - status = NO_SHOW
   * - reason opcional (guardamos en observaciones para no tocar Prisma ahora)
   */
  static async noShow(turnoId: number, reason: string | undefined, actorUserId: string) {
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
      throw new ConflictError("Solo se puede marcar NO_SHOW si el turno está ASSIGNED");
    }

    // Guardamos razón en observaciones (sin migración)
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
        throw new ConflictError("No fue posible marcar NO_SHOW: el turno ya no cumple condiciones");
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
