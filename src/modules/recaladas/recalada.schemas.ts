import { z } from "zod";
import {
  RecaladaSource,
  StatusType,
  RecaladaOperativeStatus,
} from "@prisma/client";

/* ============================================================================
 * CREATE
 * ============================================================================
 */

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

    // Manejado por negocio
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

/* ============================================================================
 * LIST
 * ============================================================================
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

/* ============================================================================
 * GET BY ID
 * ============================================================================
 */

export const getRecaladaByIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

/* ============================================================================
 * UPDATE
 * ============================================================================
 */

export const updateRecaladaParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const updateRecaladaBodySchema = z
  .object({
    buqueId: z.coerce.number().int().positive().optional(),
    paisOrigenId: z.coerce.number().int().positive().optional(),

    fechaLlegada: z.coerce.date().optional(),
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
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "Debe enviar al menos un campo para actualizar",
  })
  .refine(
    (data) =>
      !data.fechaLlegada ||
      !data.fechaSalida ||
      data.fechaSalida.getTime() >= data.fechaLlegada.getTime(),
    {
      message: "fechaSalida debe ser mayor o igual a fechaLlegada",
      path: ["fechaSalida"],
    }
  );

/* ============================================================================
 * DELETE
 * ============================================================================
 */

export const deleteRecaladaParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

/* ============================================================================
 * OPERACIÓN REAL
 * ============================================================================
 */

export const arriveRecaladaParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const arriveRecaladaBodySchema = z
  .object({
    arrivedAt: z.coerce.date().optional(),
  })
  .strict();

export const departRecaladaParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const departRecaladaBodySchema = z
  .object({
    departedAt: z.coerce.date().optional(),
  })
  .strict();

export const cancelRecaladaParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const cancelRecaladaBodySchema = z
  .object({
    reason: z.string().trim().min(3).max(500).optional(),
  })
  .strict();

/* ============================================================================
 * TYPES (todos juntos abajo ✅)
 * ============================================================================
 */

export type CreateRecaladaBody = z.infer<typeof createRecaladaSchema>;

export type ListRecaladasQuery = z.infer<typeof listRecaladasQuerySchema>;

export type GetRecaladaByIdParams = z.infer<
  typeof getRecaladaByIdParamsSchema
>;

export type UpdateRecaladaParams = z.infer<
  typeof updateRecaladaParamsSchema
>;
export type UpdateRecaladaBody = z.infer<
  typeof updateRecaladaBodySchema
>;

export type DeleteRecaladaParams = z.infer<
  typeof deleteRecaladaParamsSchema
>;

export type ArriveRecaladaParams = z.infer<
  typeof arriveRecaladaParamsSchema
>;
export type ArriveRecaladaBody = z.infer<
  typeof arriveRecaladaBodySchema
>;

export type DepartRecaladaParams = z.infer<
  typeof departRecaladaParamsSchema
>;
export type DepartRecaladaBody = z.infer<
  typeof departRecaladaBodySchema
>;

export type CancelRecaladaParams = z.infer<
  typeof cancelRecaladaParamsSchema
>;
export type CancelRecaladaBody = z.infer<
  typeof cancelRecaladaBodySchema
>;
