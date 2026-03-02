// src/middlewares/response-log.ts
import type { NextFunction, Request, Response } from "express"
import { logsService } from "../libs/logs/logs.service"

export function responseLog(req: Request, res: Response, next: NextFunction) {
  res.on("finish", () => {
    logsService.httpLog(req, res, {
      event: "http.response",
      meta: { clientPlatform: req.clientPlatform },
    })
  })

  next()
}