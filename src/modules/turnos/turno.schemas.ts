import { z } from "zod";

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

// Types
export type AssignTurnoParams = z.infer<typeof assignTurnoParamsSchema>;
export type AssignTurnoBody = z.infer<typeof assignTurnoBodySchema>;

export type UnassignTurnoParams = z.infer<typeof unassignTurnoParamsSchema>;
export type UnassignTurnoBody = z.infer<typeof unassignTurnoBodySchema>;

export type CheckInTurnoParams = z.infer<typeof checkInTurnoParamsSchema>;
export type CheckOutTurnoParams = z.infer<typeof checkOutTurnoParamsSchema>;

export type NoShowTurnoParams = z.infer<typeof noShowTurnoParamsSchema>;
export type NoShowTurnoBody = z.infer<typeof noShowTurnoBodySchema>;
