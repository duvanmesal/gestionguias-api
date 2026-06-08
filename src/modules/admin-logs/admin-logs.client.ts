// src/modules/admin-logs/admin-logs.client.ts
//
// Cliente hacia el LogService. Vive únicamente en el servidor.
// READ key: consultas de logs, facets, timeline, alert rules (lectura).
// ADMIN key: mutaciones de alert rules (POST/PATCH/DELETE).
// El JWT del usuario NUNCA llega al LogService.
import { env } from "../../config/env"
import { logger } from "../../libs/logger"
import {
  AppError,
  BadGatewayError,
  GatewayTimeoutError,
  NotFoundError,
  ServiceUnavailableError,
} from "../../libs/errors"

/** Envelope estándar que devuelve el LogService: { data, meta, error }. */
export type LogsEnvelope<T = unknown> = {
  data: T | null
  meta: unknown
  error: { code: string; message: string; details?: unknown } | null
}

/** El proxy solo está habilitado si hay URL y READ key configuradas. */
export function isAdminLogsConfigured(): boolean {
  return Boolean(env.LOGS_ENABLED && env.LOGS_SERVICE_URL && env.LOGS_READ_API_KEY)
}

/** Construye la query string descartando undefined/null/"" . */
function toQueryString(params: Record<string, unknown>): string {
  const sp = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue
    sp.set(key, String(value))
  }
  const qs = sp.toString()
  return qs ? `?${qs}` : ""
}

async function request<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  apiKey: string,
  body?: unknown,
): Promise<LogsEnvelope<T>> {
  if (!isAdminLogsConfigured()) {
    throw new ServiceUnavailableError("Logs service is not configured", {
      reason: "missing_read_api_key",
    })
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), env.LOGS_TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(`${env.LOGS_SERVICE_URL}${path}`, {
      method,
      headers: {
        accept: "application/json",
        "x-api-key": apiKey,
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })
  } catch (e: any) {
    const aborted = e?.name === "AbortError"
    logger.warn(
      { path, method, aborted, err: aborted ? "timeout" : e?.message ?? "network_error" },
      "admin-logs upstream request failed",
    )
    if (aborted) throw new GatewayTimeoutError("Logs service did not respond in time")
    throw new BadGatewayError("Logs service is unreachable")
  } finally {
    clearTimeout(timer)
  }

  if (res.status === 401 || res.status === 403) {
    logger.error({ path, method, status: res.status }, "admin-logs upstream auth error")
    throw new AppError(502, "LOGS_SERVICE_AUTH_ERROR", "Logs service rejected the server credentials")
  }

  if (res.status === 404) throw new NotFoundError("Resource not found")

  if (res.status >= 500) {
    logger.warn({ path, method, status: res.status }, "admin-logs upstream 5xx")
    throw new BadGatewayError("Logs service returned an error")
  }

  let responseBody: LogsEnvelope<T>
  try {
    responseBody = (await res.json()) as LogsEnvelope<T>
  } catch {
    throw new BadGatewayError("Logs service returned an invalid response")
  }

  if (res.status >= 400) {
    const code = responseBody?.error?.code ?? "BAD_GATEWAY"
    const message = responseBody?.error?.message ?? "Logs service request failed"
    throw new AppError(res.status, code, message, responseBody?.error?.details)
  }

  return responseBody
}

function readJson<T>(path: string): Promise<LogsEnvelope<T>> {
  return request<T>("GET", path, env.LOGS_READ_API_KEY)
}

function adminJson<T>(
  method: "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<LogsEnvelope<T>> {
  return request<T>(method, path, env.LOGS_ADMIN_API_KEY, body)
}

export const adminLogsClient = {
  // ── Logs ──────────────────────────────────────────────────────────────
  list<T = unknown>(query: Record<string, unknown>): Promise<LogsEnvelope<T[]>> {
    return readJson<T[]>(`/logs${toQueryString(query)}`)
  },
  stats<T = unknown>(query: Record<string, unknown>): Promise<LogsEnvelope<T>> {
    return readJson<T>(`/logs/stats${toQueryString(query)}`)
  },
  getById<T = unknown>(id: string): Promise<LogsEnvelope<T>> {
    return readJson<T>(`/logs/${encodeURIComponent(id)}`)
  },

  // ── Facets & Timeline ──────────────────────────────────────────────────
  facets<T = unknown>(query: Record<string, unknown>): Promise<LogsEnvelope<T>> {
    return readJson<T>(`/logs/facets${toQueryString(query)}`)
  },
  timeline<T = unknown>(query: Record<string, unknown>): Promise<LogsEnvelope<T>> {
    return readJson<T>(`/logs/timeline${toQueryString(query)}`)
  },

  // ── Alert Rules — read ─────────────────────────────────────────────────
  alertRulesList<T = unknown>(): Promise<LogsEnvelope<T[]>> {
    return readJson<T[]>(`/alerts/rules`)
  },
  alertRulesGetById<T = unknown>(id: string): Promise<LogsEnvelope<T>> {
    return readJson<T>(`/alerts/rules/${encodeURIComponent(id)}`)
  },
  alertsEvaluate<T = unknown>(query: Record<string, unknown>): Promise<LogsEnvelope<T[]>> {
    return readJson<T[]>(`/alerts/evaluate${toQueryString(query)}`)
  },

  // ── Alert Rules — mutations (requires ADMIN key) ───────────────────────
  alertRulesCreate<T = unknown>(body: unknown): Promise<LogsEnvelope<T>> {
    return adminJson<T>("POST", `/alerts/rules`, body)
  },
  alertRulesUpdate<T = unknown>(id: string, body: unknown): Promise<LogsEnvelope<T>> {
    return adminJson<T>("PATCH", `/alerts/rules/${encodeURIComponent(id)}`, body)
  },
  alertRulesDelete<T = unknown>(id: string): Promise<LogsEnvelope<T>> {
    return adminJson<T>("DELETE", `/alerts/rules/${encodeURIComponent(id)}`)
  },
}
