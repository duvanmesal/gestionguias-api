// src/libs/logs/logs.builder.ts
import type { Request, Response } from "express"
import { env } from "../../config/env"

export type LogsLevel = "info" | "warn" | "error"

export type LogsActor = {
  userId?: string
  email?: string
  role?: string
}

export type LogsTarget = {
  entity?: string
  id?: string
  email?: string
}

export type LogsHttp = {
  method?: string
  path?: string
  status?: number
  ip?: string
  userAgent?: string
  durationMs?: number
}

export type LogsItem = {
  level: LogsLevel
  event: string
  message?: string
  service: string
  requestId?: string
  actor?: LogsActor
  target?: LogsTarget
  http?: LogsHttp
  meta?: Record<string, any>
  ts: string
}

export type BuildLogInput = {
  level: LogsLevel
  event: string
  message?: string
  target?: LogsTarget
  meta?: Record<string, any>
  http?: Partial<LogsHttp>
}

function durationMsFromReq(req: Request): number | undefined {
  const startAt = req.startAt
  if (typeof startAt === "bigint") {
    const diffNs = process.hrtime.bigint() - startAt
    return Number(diffNs / 1_000_000n)
  }
  if (typeof startAt === "number") {
    return Math.max(0, Date.now() - startAt)
  }
  return undefined
}

function actorFromReq(req: Request): LogsActor | undefined {
  // req.user puede variar por tu auth, así que lo hacemos súper tolerante
  const u: any = (req as any).user
  if (!u) return undefined

  return {
    userId: u.id ?? u.userId ?? u.sub,
    email: u.email,
    role: u.role,
  }
}

export function buildLogItem(req: Request, input: BuildLogInput): LogsItem {
  const requestId =
    req.requestId ?? (typeof req.headers["x-request-id"] === "string"
      ? req.headers["x-request-id"]
      : undefined)

  const http: LogsHttp | undefined = {
    method: req.method,
    path: req.originalUrl,
    ip: req.ip,
    userAgent: req.header("user-agent") ?? undefined,
    durationMs: durationMsFromReq(req),
    ...input.http,
  }

  return {
    level: input.level,
    event: input.event,
    message: input.message,
    service: env.SERVICE_NAME,
    requestId,
    actor: actorFromReq(req),
    target: input.target,
    http,
    meta: input.meta,
    ts: new Date().toISOString(),
  }
}

export function buildHttpResponseLog(
  req: Request,
  res: Response,
  input?: { event?: string; meta?: Record<string, any>; message?: string },
): LogsItem {
  const status = res.statusCode

  return buildLogItem(req, {
    level: status >= 500 ? "error" : status >= 400 ? "warn" : "info",
    event: input?.event ?? "http.response",
    message: input?.message ?? `${req.method} ${req.originalUrl} -> ${status}`,
    meta: input?.meta,
    http: { status },
  })
}