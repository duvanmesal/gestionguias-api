// src/middlewares/requestContext.ts
import type { NextFunction, Request, Response } from "express"
import crypto from "crypto"

export function requestContext(req: Request, res: Response, next: NextFunction) {
  const incoming = req.header("x-request-id")
  const requestId =
    incoming && incoming.trim() ? incoming.trim() : crypto.randomUUID()

  req.requestId = requestId
  req.startAt = process.hrtime.bigint()

  // opcional (pero útil)
  res.locals.requestId = requestId

  // Propaga al cliente
  res.setHeader("x-request-id", requestId)

  next()
}