// src/libs/logs/logs.client.ts
import { env } from "../../config/env"
import { logger } from "../logger"
import type { LogsItem } from "./logs.builder"

type SendOptions = {
  timeoutMs?: number
  retries?: number // retries livianos (0-2)
}

function enabled(): boolean {
  if (!env.LOGS_ENABLED) return false
  if (!env.LOGS_SERVICE_URL) return false
  if (!env.LOGS_INGEST_API_KEY) return false
  return true
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function postJson(path: string, body: any, opts?: SendOptions): Promise<void> {
  if (!enabled()) return

  const timeoutMs = opts?.timeoutMs ?? env.LOGS_TIMEOUT_MS
  const retries = Math.max(0, Math.min(opts?.retries ?? 0, 2))

  let attempt = 0
  while (true) {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const res = await fetch(`${env.LOGS_SERVICE_URL}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": env.LOGS_INGEST_API_KEY,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      // Si logs-service responde 4xx, no vale la pena reintentar (payload malo / auth)
      if (res.status >= 400 && res.status < 500) return

      // 2xx/3xx ok. 5xx: se puede reintentar
      if (res.status < 500) return
      throw new Error(`logs-service ${res.status}`)
    } catch (e: any) {
      // fail-silent total: nunca tumbar tu API
      if (attempt >= retries) {
        logger.debug(
          { err: e?.message ?? e, path, attempt },
          "Logs service unreachable (ignored)",
        )
        return
      }
      attempt += 1
      await sleep(50 * attempt) // backoff mini: 50ms, 100ms...
    } finally {
      clearTimeout(t)
    }
  }
}

export async function sendLog(item: LogsItem, opts?: SendOptions): Promise<void> {
  return postJson("/logs", item, { retries: 1, ...opts })
}

export async function sendBatch(items: LogsItem[], opts?: SendOptions): Promise<void> {
  if (!items.length) return
  return postJson("/logs/batch", { items }, { retries: 1, ...opts })
}