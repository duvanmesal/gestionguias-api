// src/middlewares/error-handler.ts
import type { Request, Response, NextFunction } from "express"
import { ZodError } from "zod"
import { AppError } from "../libs/errors"
import { logger } from "../libs/logger"
import { env } from "../config/env"
import { logsService } from "../libs/logs/logs.service"

function safeErrorMeta(err: any) {
  return {
    name: err?.name,
    sourceCode: err?.code,
    message: err?.message,
    details: err?.details ?? err?.meta ?? null,
    stack: env.NODE_ENV !== "production" ? err?.stack : undefined,
  }
}

function logHttpError(req: Request, status: number, message: string, meta?: Record<string, any>) {
  logsService.audit(req, {
    level: "error",
    event: "http.error",
    message,
    meta: {
      ...meta,
      httpStatus: status,
      clientPlatform: req.clientPlatform,
    },
  })
}

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  // Bad JSON
  if (
    err?.type === "entity.parse.failed" ||
    (err instanceof SyntaxError && "body" in err)
  ) {
    logger.error({ err }, "Bad JSON payload")

    logHttpError(req, 400, "Bad JSON payload", {
      ...safeErrorMeta(err),
      code: "BAD_JSON",
    })

    return res.status(400).json({
      data: null,
      meta: null,
      error: {
        code: "BAD_JSON",
        message: "Malformed JSON in request body",
        details: env.NODE_ENV !== "production" ? err.message : undefined,
      },
    })
  }

  logger.error("🔥 Unhandled error", {
    err,
    name: err?.name,
    code: err?.code,
    message: err?.message,
    stack: err?.stack,
    details: err?.details,
  } as any)

  // Zod
  if (err instanceof ZodError) {
    logHttpError(req, 400, "Validation error", {
      ...safeErrorMeta(err),
      code: "VALIDATION_ERROR",
      details: err.flatten(),
    })

    return res.status(400).json({
      data: null,
      meta: null,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid input",
        details: err.flatten(),
        stack: env.NODE_ENV !== "production" ? err.stack : undefined,
      },
    })
  }

  // Prisma unique
  if (err?.code === "P2002") {
    logHttpError(req, 409, "Unique constraint failed", {
      ...safeErrorMeta(err),
      code: "CONFLICT",
      details: err.meta,
    })

    return res.status(409).json({
      data: null,
      meta: null,
      error: {
        code: "CONFLICT",
        message: "Unique constraint failed",
        details: err.meta,
        stack: env.NODE_ENV !== "production" ? err.stack : undefined,
      },
    })
  }

  // Prisma not found
  if (err?.code === "P2025") {
    logHttpError(req, 404, "Record not found", {
      ...safeErrorMeta(err),
      code: "NOT_FOUND",
    })

    return res.status(404).json({
      data: null,
      meta: null,
      error: {
        code: "NOT_FOUND",
        message: "Record not found",
        stack: env.NODE_ENV !== "production" ? err.stack : undefined,
      },
    })
  }

  // Prisma generic
  if (err?.clientVersion && err?.meta && err?.code?.startsWith("P")) {
    logHttpError(req, 500, "Prisma error", {
      ...safeErrorMeta(err),
      code: `PRISMA_${err.code}`,
    })

    return res.status(500).json({
      data: null,
      meta: null,
      error: {
        code: `PRISMA_${err.code}`,
        message: err.message,
        details: err.meta,
        stack: env.NODE_ENV !== "production" ? err.stack : undefined,
      },
    })
  }

  // AppError
  if (err instanceof AppError) {
    logHttpError(req, err.status, err.message, {
      ...safeErrorMeta(err),
      code: err.code,
      details: err.details ?? null,
    })

    return res.status(err.status).json({
      data: null,
      meta: null,
      error: {
        code: err.code,
        message: err.message,
        details: err.details ?? null,
        stack: env.NODE_ENV !== "production" ? err.stack : undefined,
      },
    })
  }

  // Fallback 500
  logHttpError(req, 500, err?.message ?? "Unexpected error", {
    ...safeErrorMeta(err),
    code: "INTERNAL_SERVER_ERROR",
  })

  return res.status(500).json({
    data: null,
    meta: null,
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message:
        env.NODE_ENV === "production"
          ? "Unexpected error"
          : err?.message ?? "Unexpected error",
      name: err?.name,
      details: env.NODE_ENV !== "production" ? (err?.details ?? null) : null,
      stack: env.NODE_ENV !== "production" ? err?.stack : undefined,
    },
  })
}