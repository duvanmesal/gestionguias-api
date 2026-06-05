// src/modules/admin-logs/admin-logs.export.ts
//
// Recolección acotada de logs para exportación (vía el proxy de lectura) y
// serialización a CSV/JSON. El cap de filas evita descargas ilimitadas.
import { adminLogsClient } from "./admin-logs.client"
import { EXPORT_MAX_ROWS } from "./admin-logs.schemas"

const PAGE_SIZE = 200

type LogRow = {
  ts?: string
  level?: string
  service?: string
  event?: string
  message?: string
  actor?: { userId?: string; email?: string; role?: string }
  http?: { method?: string; status?: number; path?: string; durationMs?: number }
  requestId?: string
  [k: string]: unknown
}

/**
 * Pagina el LogService hasta `EXPORT_MAX_ROWS`. Devuelve las filas y si la
 * exportación quedó truncada por alcanzar el tope.
 */
export async function collectLogsForExport(
  filters: Record<string, unknown>,
): Promise<{ rows: LogRow[]; truncated: boolean }> {
  const rows: LogRow[] = []
  let page = 1
  let totalPages = 1

  do {
    const res = await adminLogsClient.list<LogRow>({
      ...filters,
      page,
      pageSize: PAGE_SIZE,
    })
    const items = res.data ?? []
    rows.push(...items)

    const meta = res.meta as { totalPages?: number } | null
    totalPages = meta?.totalPages ?? page
    page += 1
  } while (page <= totalPages && rows.length < EXPORT_MAX_ROWS)

  const truncated = rows.length > EXPORT_MAX_ROWS
  return { rows: rows.slice(0, EXPORT_MAX_ROWS), truncated }
}

const CSV_COLUMNS: Array<{ header: string; get: (r: LogRow) => unknown }> = [
  { header: "ts", get: (r) => r.ts },
  { header: "level", get: (r) => r.level },
  { header: "service", get: (r) => r.service },
  { header: "event", get: (r) => r.event },
  { header: "message", get: (r) => r.message },
  { header: "actorUserId", get: (r) => r.actor?.userId },
  { header: "actorEmail", get: (r) => r.actor?.email },
  { header: "actorRole", get: (r) => r.actor?.role },
  { header: "method", get: (r) => r.http?.method },
  { header: "status", get: (r) => r.http?.status },
  { header: "durationMs", get: (r) => r.http?.durationMs },
  { header: "path", get: (r) => r.http?.path },
  { header: "requestId", get: (r) => r.requestId },
]

/** Escapa un valor para CSV (RFC 4180): comillas dobladas y celda entrecomillada. */
function csvCell(value: unknown): string {
  if (value == null) return ""
  const s = String(value)
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export function toCsv(rows: LogRow[]): string {
  const header = CSV_COLUMNS.map((c) => c.header).join(",")
  const lines = rows.map((r) => CSV_COLUMNS.map((c) => csvCell(c.get(r))).join(","))
  // BOM para que Excel reconozca UTF-8.
  return "﻿" + [header, ...lines].join("\r\n")
}

export function toJson(rows: LogRow[]): string {
  return JSON.stringify(rows, null, 2)
}
