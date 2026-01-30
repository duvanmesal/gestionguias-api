import { prisma } from "../../prisma/client";
import { BadRequestError, NotFoundError } from "../../libs/errors";
import { logger } from "../../libs/logger";
import type { RecaladaSource, StatusType } from "@prisma/client";

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
}
