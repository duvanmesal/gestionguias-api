import { z } from "zod";

/**
 * GET /dashboard/overview
 * Permite opcionalmente pedir overview para un día específico (YYYY-MM-DD).
 *
 * Si no envías date, el backend calcula "hoy" con base en tzOffsetMinutes (default -300 = Bogota).
 */
export const overviewQuerySchema = z.object({
  date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD")
    .optional(),

  /**
   * Offset en minutos respecto a UTC.
   * Bogota = -300
   * Esto hace que el "día" sea consistente aunque el servidor esté en UTC.
   */
  tzOffsetMinutes: z.coerce.number().int().min(-840).max(840).default(-300),

  /**
   * Límite de "hitos" para supervisor
   */
  upcomingLimit: z.coerce.number().int().min(1).max(20).default(8),

  /**
   * Límite de atenciones disponibles para guía
   */
  availableAtencionesLimit: z.coerce.number().int().min(1).max(50).default(10),

  /**
   * Rango en días para las estadísticas históricas del supervisor.
   * 7 = última semana, 30 = último mes. Máximo 30.
   */
  rangeDays: z.coerce
    .number()
    .int()
    .refine((v) => v === 7 || v === 30, { message: "rangeDays must be 7 or 30" })
    .default(30),
});

export type OverviewQuery = z.infer<typeof overviewQuerySchema>;