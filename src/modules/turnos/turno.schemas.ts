import { z } from "zod";
import { TurnoStatus } from "@prisma/client";

/**
 * GET /turnos
 * Query:
 * - dateFrom, dateTo (al menos uno, o default a hoy)
 * - atencionId?, recaladaId?
 * - status?
 * - assigned? true|false
 * - page, pageSize
 */
export const listTurnosQuerySchema = z
  .object({
    dateFrom: z.coerce.date().optional(),
    dateTo: z.coerce.date().optional(),

    atencionId: z.coerce.number().int().positive().optional(),
    recaladaId: z.coerce.number().int().positive().optional(),

    status: z.nativeEnum(TurnoStatus).optional(),

    guiaId: z.string().min(1).trim().optional(),

    assigned: z
      .union([z.literal("true"), z.literal("false"), z.boolean()])
      .transform((v) => (v === true || v === "true" ? true : false))
      .optional(),

    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
  })
  .refine((data) => !data.dateFrom || !data.dateTo || data.dateTo >= data.dateFrom, {
    message: "dateTo debe ser mayor o igual a dateFrom",
    path: ["dateTo"],
  });


/**
 * GET /turnos/me
 * Igual que listTurnosQuerySchema, pero:
 * - NO permite "assigned" (siempre es assigned al guía autenticado)
 */
export const listTurnosMeQuerySchema = z
  .object({
    dateFrom: z.coerce.date().optional(),
    dateTo: z.coerce.date().optional(),

    atencionId: z.coerce.number().int().positive().optional(),
    recaladaId: z.coerce.number().int().positive().optional(),

    status: z.nativeEnum(TurnoStatus).optional(),

    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
  })
  .refine((data) => !data.dateFrom || !data.dateTo || data.dateTo >= data.dateFrom, {
    message: "dateTo debe ser mayor o igual a dateFrom",
    path: ["dateTo"],
  });

/**
 * GET /turnos/:id
 */
export const getTurnoByIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

/**
 * POST /turnos/:id/claim
 * Params: { id }
 */
export const claimTurnoParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

/**
 * PATCH /turnos/:id/assign
 * Body: { guiaId: string }
 */
export const assignTurnoParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const assignTurnoBodySchema = z.object({
  guiaId: z.string().min(1, "guiaId is required").trim(),
});

/**
 * PATCH /turnos/:id/unassign
 * Body: { reason?: string }
 */
export const unassignTurnoParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const unassignTurnoBodySchema = z.object({
  reason: z
    .string()
    .min(1, "reason must not be empty")
    .max(500, "reason too long")
    .trim()
    .optional(),
});

/**
 * PATCH /turnos/:id/check-in
 * Body: none
 */
export const checkInTurnoParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

/**
 * PATCH /turnos/:id/check-out
 * Body: none
 */
export const checkOutTurnoParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

/**
 * PATCH /turnos/:id/no-show
 * Body: { reason?: string }
 */
export const noShowTurnoParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const noShowTurnoBodySchema = z.object({
  reason: z
    .string()
    .min(1, "reason must not be empty")
    .max(500, "reason too long")
    .trim()
    .optional(),
});
export const cancelTurnoParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const cancelTurnoBodySchema = z.object({
  cancelReason: z
    .string()
    .min(1, "cancelReason must not be empty")
    .max(500, "cancelReason too long")
    .trim()
    .optional(),
});

// Types
export type ListTurnosQuery = z.infer<typeof listTurnosQuerySchema>;
export type ListTurnosMeQuery = z.infer<typeof listTurnosMeQuerySchema>;

export type GetTurnoByIdParams = z.infer<typeof getTurnoByIdParamsSchema>;
export type ClaimTurnoParams = z.infer<typeof claimTurnoParamsSchema>;

export type AssignTurnoParams = z.infer<typeof assignTurnoParamsSchema>;
export type AssignTurnoBody = z.infer<typeof assignTurnoBodySchema>;

export type UnassignTurnoParams = z.infer<typeof unassignTurnoParamsSchema>;
export type UnassignTurnoBody = z.infer<typeof unassignTurnoBodySchema>;

export type CheckInTurnoParams = z.infer<typeof checkInTurnoParamsSchema>;
export type CheckOutTurnoParams = z.infer<typeof checkOutTurnoParamsSchema>;

export type NoShowTurnoParams = z.infer<typeof noShowTurnoParamsSchema>;
export type NoShowTurnoBody = z.infer<typeof noShowTurnoBodySchema>;

export type CancelTurnoParams = z.infer<typeof cancelTurnoParamsSchema>;
export type CancelTurnoBody = z.infer<typeof cancelTurnoBodySchema>;
