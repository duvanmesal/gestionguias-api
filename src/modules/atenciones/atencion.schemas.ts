import { z } from "zod";
import { AtencionOperativeStatus, StatusType } from "@prisma/client";

export const createAtencionSchema = z
  .object({
    recaladaId: z.coerce.number().int().positive(),

    // ISO string (DateTime) -> z.coerce.date() acepta string/number/date
    fechaInicio: z.coerce.date(),
    fechaFin: z.coerce.date(),

    // Cupo (materializable en turnos 1..N)
    turnosTotal: z.coerce.number().int().positive().max(5000),

    descripcion: z.string().trim().max(500).optional(),
  })
  .refine((data) => data.fechaFin >= data.fechaInicio, {
    message: "fechaFin debe ser mayor o igual a fechaInicio",
    path: ["fechaFin"],
  });

export const listAtencionesQuerySchema = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),

    recaladaId: z.coerce.number().int().positive().optional(),
    supervisorId: z.string().trim().min(1).max(60).optional(),

    status: z.nativeEnum(StatusType).optional(),
    operationalStatus: z.nativeEnum(AtencionOperativeStatus).optional(),

    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
  })
  .refine((data) => !data.from || !data.to || data.to >= data.from, {
    message: "to debe ser mayor o igual a from",
    path: ["to"],
  });

export const getAtencionByIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

/**
 * PATCH /atenciones/:id
 * Campos opcionales para edición de planificación.
 */
export const updateAtencionParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const updateAtencionBodySchema = z
  .object({
    fechaInicio: z.coerce.date().optional(),
    fechaFin: z.coerce.date().optional(),

    turnosTotal: z.coerce.number().int().positive().max(5000).optional(),
    descripcion: z.string().trim().max(500).nullable().optional(),

    status: z.nativeEnum(StatusType).optional(),
  })
  .refine(
    (data) =>
      !data.fechaInicio ||
      !data.fechaFin ||
      data.fechaFin >= data.fechaInicio,
    {
      message: "fechaFin debe ser mayor o igual a fechaInicio",
      path: ["fechaFin"],
    }
  );

/**
 * PATCH /atenciones/:id/cancel
 */
export const cancelAtencionParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const cancelAtencionBodySchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

/**
 * PATCH /atenciones/:id/close
 */
export const closeAtencionParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type CreateAtencionBody = z.infer<typeof createAtencionSchema>;
export type ListAtencionesQuery = z.infer<typeof listAtencionesQuerySchema>;
export type GetAtencionByIdParams = z.infer<typeof getAtencionByIdParamsSchema>;

export type UpdateAtencionParams = z.infer<typeof updateAtencionParamsSchema>;
export type UpdateAtencionBody = z.infer<typeof updateAtencionBodySchema>;

export type CancelAtencionParams = z.infer<typeof cancelAtencionParamsSchema>;
export type CancelAtencionBody = z.infer<typeof cancelAtencionBodySchema>;

export type CloseAtencionParams = z.infer<typeof closeAtencionParamsSchema>;
