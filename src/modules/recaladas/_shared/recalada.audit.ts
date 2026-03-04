import type { Request } from "express"

import { logsService } from "../../../libs/logs/logs.service"

type Target = { entity?: string; id?: string; email?: string }

export function auditFail(
  req: Request,
  event: string,
  message: string,
  meta?: Record<string, any>,
  target?: Target,
) {
  logsService.audit(req, {
    event,
    level: "warn",
    message,
    meta,
    target,
  })
}

export function auditOk(
  req: Request,
  event: string,
  message: string,
  meta?: Record<string, any>,
  target?: Target,
) {
  logsService.audit(req, {
    event,
    message,
    meta,
    target,
  })
}