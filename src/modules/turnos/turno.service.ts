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
}
