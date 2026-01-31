import { z } from "zod";
import {
  RecaladaSource,
  StatusType,
  RecaladaOperativeStatus,
} from "@prisma/client";

export const createRecaladaSchema = z
  .object({
    buqueId: z.coerce.number().int().positive(),
    paisOrigenId: z.coerce.number().int().positive(),

    // ISO string (DateTime)
    fechaLlegada: z.coerce.date(),
    fechaSalida: z.coerce.date().optional(),

    terminal: z.string().trim().min(2).max(80).optional(),
    muelle: z.string().trim().min(1).max(80).optional(),

    pasajerosEstimados: z.coerce
      .number()
      .int()
      .nonnegative()
      .max(300000)
      .optional(),
    tripulacionEstimada: z.coerce
      .number()
      .int()
      .nonnegative()
      .max(300000)
      .optional(),

    observaciones: z.string().trim().max(2000).optional(),
    fuente: z.nativeEnum(RecaladaSource).optional(),

    // Por ahora NO lo exponemos como input (se maneja por negocio),
    // pero si en el futuro lo quieres permitir, ya está listo:
    status: z.nativeEnum(StatusType).optional(),
  })
  .refine(
    (data) =>
      !data.fechaSalida ||
      data.fechaSalida.getTime() >= data.fechaLlegada.getTime(),
    {
      message: "fechaSalida debe ser mayor o igual a fechaLlegada",
      path: ["fechaSalida"],
    }
  );

/**
 * GET /recaladas (agenda)
 * Query params:
 * - from, to: rango de fechas (recomendado)
 * - operationalStatus?
 * - buqueId?
 * - paisOrigenId?
 * - q? (codigoRecalada, buque, observaciones)
 * - page, pageSize
 */
export const listRecaladasQuerySchema = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),

    operationalStatus: z.nativeEnum(RecaladaOperativeStatus).optional(),

    buqueId: z.coerce.number().int().positive().optional(),
    paisOrigenId: z.coerce.number().int().positive().optional(),

    q: z.string().trim().min(1).max(200).optional(),

    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
  })
  .refine((data) => !data.from || !data.to || data.to >= data.from, {
    message: "to debe ser mayor o igual a from",
    path: ["to"],
  });

export type ListRecaladasQuery = z.infer<typeof listRecaladasQuerySchema>;

/**
 * ✅ ADICIÓN
 * GET /recaladas/:id
 * Params:
 * - id (number)
 */
export const getRecaladaByIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type GetRecaladaByIdParams = z.infer<typeof getRecaladaByIdParamsSchema>;
