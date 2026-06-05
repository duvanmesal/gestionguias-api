// src/modules/admin-logs/admin-logs.controller.ts
//
// Proxy de SOLO LECTURA: valida (vía middleware), consulta el LogService con la
// READ key del servidor y reenvía su envelope { data, meta, error } tal cual.
// Audita cada consulta administrativa SIN registrar resultados completos ni
// secretos (solo filtros y conteos).
import type { Request, Response, NextFunction } from "express"
import { adminLogsClient } from "./admin-logs.client"
import {
  listLogsQuerySchema,
  statsLogsQuerySchema,
  logIdParamsSchema,
  exportLogsQuerySchema,
  mapListQuery,
  mapStatsQuery,
  mapExportFilters,
} from "./admin-logs.schemas"
import { collectLogsForExport, toCsv, toJson } from "./admin-logs.export"
import { logsService } from "../../libs/logs/logs.service"

export const AdminLogsController = {
  /** GET /admin/logs — lista paginada. */
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      // Ya validado por `validate`, re-parseamos para tipar sin `any`.
      const query = listLogsQuerySchema.parse(req.query)
      const upstream = await adminLogsClient.list(mapListQuery(query))

      logsService.audit(req, {
        event: "adminLogs.list",
        meta: {
          // Solo metadatos de la consulta, nunca el contenido de los logs.
          filters: {
            level: query.level,
            service: query.service,
            action: query.action,
            userId: query.userId,
            requestId: query.requestId,
            hasText: Boolean(query.q),
            from: query.from,
            to: query.to,
          },
          page: query.page,
          limit: query.limit,
          resultCount: Array.isArray(upstream.data) ? upstream.data.length : 0,
          total: (upstream.meta as { total?: number } | null)?.total,
        },
      })

      res.status(200).json(upstream)
    } catch (err) {
      next(err)
    }
  },

  /** GET /admin/logs/stats — agregados para el dashboard. */
  async stats(req: Request, res: Response, next: NextFunction) {
    try {
      const query = statsLogsQuerySchema.parse(req.query)
      const upstream = await adminLogsClient.stats(mapStatsQuery(query))

      logsService.audit(req, {
        event: "adminLogs.stats",
        meta: {
          filters: {
            level: query.level,
            service: query.service,
            action: query.action,
            userId: query.userId,
            from: query.from,
            to: query.to,
          },
          tz: query.tz,
        },
      })

      res.status(200).json(upstream)
    } catch (err) {
      next(err)
    }
  },

  /** GET /admin/logs/:id — detalle de un log. Preserva 404 del upstream. */
  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = logIdParamsSchema.parse(req.params)
      const upstream = await adminLogsClient.getById(id)

      logsService.audit(req, {
        event: "adminLogs.detail",
        target: { entity: "log", id },
      })

      res.status(200).json(upstream)
    } catch (err) {
      next(err)
    }
  },

  /**
   * GET /admin/logs/export — descarga CSV/JSON.
   * Rango de fechas obligatorio (schema) y cap de filas (helper).
   */
  async export(req: Request, res: Response, next: NextFunction) {
    try {
      const query = exportLogsQuerySchema.parse(req.query)
      const { rows, truncated } = await collectLogsForExport(mapExportFilters(query))

      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")
      const filename = `logs-${stamp}.${query.format}`

      logsService.audit(req, {
        event: "adminLogs.export",
        meta: {
          format: query.format,
          from: query.from,
          to: query.to,
          rowCount: rows.length,
          truncated,
          filters: {
            level: query.level,
            service: query.service,
            action: query.action,
            module: query.module,
            method: query.method,
            statusCode: query.statusCode,
          },
        },
      })

      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`)
      // Señaliza si el resultado quedó truncado por el tope de filas.
      res.setHeader("X-Export-Truncated", String(truncated))

      if (query.format === "json") {
        res.setHeader("Content-Type", "application/json; charset=utf-8")
        res.status(200).send(toJson(rows))
      } else {
        res.setHeader("Content-Type", "text/csv; charset=utf-8")
        res.status(200).send(toCsv(rows))
      }
    } catch (err) {
      next(err)
    }
  },
}
