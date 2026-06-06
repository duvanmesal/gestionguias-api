// src/modules/admin-logs/admin-logs.schemas.ts
//
// Esquemas Zod de cara al FRONTEND del panel de logs. Usan los nombres de
// parámetros del plan (page, limit, level, service, action, userId, ...) y luego
// se mapean al contrato real del LogService en `mapListQuery` / `mapStatsQuery`.
//
// Fase 3: el LogService ya soporta filtros exactos por method/statusCode/module
// (este último como prefijo del event namespaced). Se mapean directo.
import { z } from "zod"

// El LogService valida `from`/`to` como datetime ISO 8601 estricto.
const isoDatetime = z.string().datetime({ offset: true })

export const logLevelSchema = z.enum(["debug", "info", "warn", "error"])

// Filtros avanzados compartidos por list y stats (Fase 3).
const advancedFilters = {
  method: z.string().min(1).max(16).optional(),
  statusCode: z.coerce.number().int().min(100).max(599).optional(),
  module: z.string().min(1).max(80).optional(),
}

export const listLogsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(200).default(25),

    from: isoDatetime.optional(),
    to: isoDatetime.optional(),

    level: logLevelSchema.optional(),
    service: z.string().min(1).max(120).optional(),

    // `action` es la cara amable de `event` en el LogService.
    action: z.string().min(1).max(120).optional(),
    // `userId` es la cara amable de `actorUserId`.
    userId: z.string().min(1).max(120).optional(),

    requestId: z.string().min(1).max(120).optional(),
    q: z.string().min(1).max(200).optional(),

    ...advancedFilters,

    order: z.enum(["asc", "desc"]).default("desc"),
  })
  .strict()

export const statsLogsQuerySchema = z
  .object({
    from: isoDatetime.optional(),
    to: isoDatetime.optional(),

    level: logLevelSchema.optional(),
    service: z.string().min(1).max(120).optional(),
    action: z.string().min(1).max(120).optional(),
    userId: z.string().min(1).max(120).optional(),
    requestId: z.string().min(1).max(120).optional(),
    q: z.string().min(1).max(200).optional(),

    ...advancedFilters,

    topEventsLimit: z.coerce.number().int().min(1).max(50).default(10),
    tz: z.string().min(1).max(80).default("America/Bogota"),
  })
  .strict()

export const logIdParamsSchema = z.object({
  id: z.string().min(1).max(120),
})

// Límites de exportación (seguridad: rango obligatorio + acotado).
export const EXPORT_MAX_RANGE_DAYS = 92
export const EXPORT_MAX_ROWS = 5000

// Export: from/to OBLIGATORIOS y rango acotado. Sin paginación (la controla el server).
export const exportLogsQuerySchema = z
  .object({
    format: z.enum(["csv", "json"]).default("csv"),

    // Rango obligatorio.
    from: isoDatetime,
    to: isoDatetime,

    level: logLevelSchema.optional(),
    service: z.string().min(1).max(120).optional(),
    action: z.string().min(1).max(120).optional(),
    userId: z.string().min(1).max(120).optional(),
    requestId: z.string().min(1).max(120).optional(),
    q: z.string().min(1).max(200).optional(),

    ...advancedFilters,
  })
  .strict()
  .refine((v) => new Date(v.from) <= new Date(v.to), {
    message: "`from` debe ser anterior o igual a `to`",
    path: ["from"],
  })
  .refine(
    (v) =>
      (new Date(v.to).getTime() - new Date(v.from).getTime()) / 86_400_000 <=
      EXPORT_MAX_RANGE_DAYS,
    {
      message: `El rango de exportación no puede exceder ${EXPORT_MAX_RANGE_DAYS} días`,
      path: ["to"],
    },
  )

export const facetsLogsQuerySchema = z
  .object({
    from: isoDatetime.optional(),
    to: isoDatetime.optional(),
    level: logLevelSchema.optional(),
    service: z.string().min(1).max(120).optional(),
    action: z.string().min(1).max(120).optional(),
    userId: z.string().min(1).max(120).optional(),
    requestId: z.string().min(1).max(120).optional(),
    q: z.string().min(1).max(200).optional(),
    ...advancedFilters,
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict()

export const timelineLogsQuerySchema = z
  .object({
    from: isoDatetime,
    to: isoDatetime,
    level: logLevelSchema.optional(),
    service: z.string().min(1).max(120).optional(),
    action: z.string().min(1).max(120).optional(),
    userId: z.string().min(1).max(120).optional(),
    requestId: z.string().min(1).max(120).optional(),
    q: z.string().min(1).max(200).optional(),
    ...advancedFilters,
    bucket: z.enum(["minute", "hour", "day"]).default("hour"),
    tz: z.string().min(1).max(80).default("America/Bogota"),
  })
  .strict()

// Alert rules schemas
export const createAlertRuleBodySchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  level: z.enum(["error", "warn"]),
  windowMinutes: z.number().int().min(1).max(1440),
  threshold: z.number().int().min(1),
  service: z.string().optional(),
  module: z.string().optional(),
  enabled: z.boolean().default(true),
})

export const updateAlertRuleBodySchema = createAlertRuleBodySchema.partial()

export const alertRuleIdParamsSchema = z.object({
  id: z.string().min(1).max(120),
})

export const alertsEvaluateQuerySchema = z.object({
  service: z.string().min(1).max(120).optional(),
})

export type ListLogsQuery = z.infer<typeof listLogsQuerySchema>
export type StatsLogsQuery = z.infer<typeof statsLogsQuerySchema>
export type ExportLogsQuery = z.infer<typeof exportLogsQuerySchema>
export type FacetsLogsQuery = z.infer<typeof facetsLogsQuerySchema>
export type TimelineLogsQuery = z.infer<typeof timelineLogsQuerySchema>

/**
 * Traduce la query del panel al contrato del LogService:
 *   limit  -> pageSize
 *   action -> event
 *   userId -> actorUserId
 * method/statusCode/module y el resto pasan directo.
 */
export function mapListQuery(query: ListLogsQuery): Record<string, unknown> {
  return {
    page: query.page,
    pageSize: query.limit,
    from: query.from,
    to: query.to,
    level: query.level,
    service: query.service,
    event: query.action,
    actorUserId: query.userId,
    requestId: query.requestId,
    q: query.q,
    method: query.method,
    statusCode: query.statusCode,
    module: query.module,
    sort: "ts",
    order: query.order,
  }
}

export function mapStatsQuery(query: StatsLogsQuery): Record<string, unknown> {
  return {
    from: query.from,
    to: query.to,
    level: query.level,
    service: query.service,
    event: query.action,
    actorUserId: query.userId,
    requestId: query.requestId,
    q: query.q,
    method: query.method,
    statusCode: query.statusCode,
    module: query.module,
    topEventsLimit: query.topEventsLimit,
    tz: query.tz,
  }
}

export function mapFacetsQuery(query: FacetsLogsQuery): Record<string, unknown> {
  return {
    from: query.from,
    to: query.to,
    level: query.level,
    service: query.service,
    event: query.action,
    actorUserId: query.userId,
    requestId: query.requestId,
    q: query.q,
    method: query.method,
    statusCode: query.statusCode,
    module: query.module,
    limit: query.limit,
  }
}

export function mapTimelineQuery(query: TimelineLogsQuery): Record<string, unknown> {
  return {
    from: query.from,
    to: query.to,
    level: query.level,
    service: query.service,
    event: query.action,
    actorUserId: query.userId,
    requestId: query.requestId,
    q: query.q,
    method: query.method,
    statusCode: query.statusCode,
    module: query.module,
    bucket: query.bucket,
    tz: query.tz,
  }
}

/** Filtros de export hacia el LogService (sin page/limit; los controla el server). */
export function mapExportFilters(query: ExportLogsQuery): Record<string, unknown> {
  return {
    from: query.from,
    to: query.to,
    level: query.level,
    service: query.service,
    event: query.action,
    actorUserId: query.userId,
    requestId: query.requestId,
    q: query.q,
    method: query.method,
    statusCode: query.statusCode,
    module: query.module,
    sort: "ts",
    order: "desc",
  }
}
