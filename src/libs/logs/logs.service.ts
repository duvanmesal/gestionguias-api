// src/libs/logs/logs.service.ts
import type { Request, Response } from "express"
import type { LogsLevel, LogsTarget } from "./logs.builder"
import { buildHttpResponseLog, buildLogItem } from "./logs.builder"
import { sendLog } from "./logs.client"

type AuditInput = {
  event: string
  level?: LogsLevel
  message?: string
  target?: LogsTarget
  meta?: Record<string, any>
}

type HttpLogInput = {
  event?: string
  message?: string
  meta?: Record<string, any>
}

export const logsService = {
  audit(req: Request, input: AuditInput) {
    const item = buildLogItem(req, {
      level: input.level ?? "info",
      event: input.event,
      message: input.message,
      target: input.target,
      meta: input.meta,
    })
    void sendLog(item)
  },

  httpLog(req: Request, res: Response, input?: HttpLogInput) {
    const item = buildHttpResponseLog(req, res, {
      event: input?.event,
      message: input?.message,
      meta: input?.meta,
    })
    void sendLog(item)
  },
}