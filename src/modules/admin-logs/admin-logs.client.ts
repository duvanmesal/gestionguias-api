// src/modules/admin-logs/admin-logs.client.ts
//
// Cliente de SOLO LECTURA hacia el LogService. Vive únicamente en el servidor:
// envía LOGS_READ_API_KEY vía `x-api-key` y NUNCA reenvía el JWT del usuario ni
// expone la key al cliente. El proxy /admin/logs es el único consumidor.
//
// Mapeo de errores (el proxy nunca filtra secretos):
//   - LOGS_READ_API_KEY ausente / LOGS desactivado  -> 503 SERVICE_UNAVAILABLE
//   - timeout (AbortController)                      -> 504 GATEWAY_TIMEOUT
//   - LogService inalcanzable / 5xx                  -> 502 BAD_GATEWAY
//   - LogService 401 (key inválida)                  -> 502 LOGS_SERVICE_AUTH_ERROR
//   - LogService 404 en detalle                      -> 404 NOT_FOUND
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

async function readJson<T>(path: string): Promise<LogsEnvelope<T>> {
  if (!isAdminLogsConfigured()) {
    // No tumbamos el arranque de la API: solo estos endpoints quedan inhabilitados.
    throw new ServiceUnavailableError("Logs service is not configured", {
      reason: "missing_read_api_key",
    })
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), env.LOGS_TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(`${env.LOGS_SERVICE_URL}${path}`, {
      method: "GET",
      headers: {
        accept: "application/json",
        "x-api-key": env.LOGS_READ_API_KEY,
      },
      signal: controller.signal,
    })
  } catch (e: any) {
    const aborted = e?.name === "AbortError"
    // Nunca registramos la key ni la URL completa con secretos.
    logger.warn(
      { path, aborted, err: aborted ? "timeout" : e?.message ?? "network_error" },
      "admin-logs upstream request failed",
    )
    if (aborted) {
      throw new GatewayTimeoutError("Logs service did not respond in time")
    }
    throw new BadGatewayError("Logs service is unreachable")
  } finally {
    clearTimeout(timer)
  }

  // Auth contra el LogService: la key del servidor es inválida -> problema nuestro,
  // no del usuario. No exponemos la causa real.
  if (res.status === 401 || res.status === 403) {
    logger.error({ path, status: res.status }, "admin-logs upstream auth error")
    throw new AppError(
      502,
      "LOGS_SERVICE_AUTH_ERROR",
      "Logs service rejected the server credentials",
    )
  }

  if (res.status === 404) {
    throw new NotFoundError("Log not found")
  }

  if (res.status >= 500) {
    logger.warn({ path, status: res.status }, "admin-logs upstream 5xx")
    throw new BadGatewayError("Logs service returned an error")
  }

  let body: LogsEnvelope<T>
  try {
    body = (await res.json()) as LogsEnvelope<T>
  } catch {
    throw new BadGatewayError("Logs service returned an invalid response")
  }

  if (res.status >= 400) {
    // 4xx con cuerpo válido (p. ej. validación): propagamos el código del upstream.
    const code = body?.error?.code ?? "BAD_GATEWAY"
    const message = body?.error?.message ?? "Logs service request failed"
    throw new AppError(res.status, code, message, body?.error?.details)
  }

  return body
}

export const adminLogsClient = {
  list<T = unknown>(query: Record<string, unknown>): Promise<LogsEnvelope<T[]>> {
    return readJson<T[]>(`/logs${toQueryString(query)}`)
  },

  stats<T = unknown>(query: Record<string, unknown>): Promise<LogsEnvelope<T>> {
    return readJson<T>(`/logs/stats${toQueryString(query)}`)
  },

  getById<T = unknown>(id: string): Promise<LogsEnvelope<T>> {
    return readJson<T>(`/logs/${encodeURIComponent(id)}`)
  },
}
