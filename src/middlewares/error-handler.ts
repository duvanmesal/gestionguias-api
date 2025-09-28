import type { Request, Response, NextFunction } from "express"
import { ZodError } from "zod"
import { AppError } from "../libs/errors"
import { logger } from "../libs/logger"

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  // Log error
  logger.error(err, "Unhandled error")

  // Zod validation errors
  if (err instanceof ZodError) {
    return res.status(400).json({
      data: null,
      meta: null,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid input",
        details: err.flatten(),
      },
    })
  }

  // Prisma unique constraint errors
  if (err?.code === "P2002") {
    return res.status(409).json({
      data: null,
      meta: null,
      error: {
        code: "CONFLICT",
        message: "Unique constraint failed",
        details: err.meta,
      },
    })
  }

  // Prisma record not found
  if (err?.code === "P2025") {
    return res.status(404).json({
      data: null,
      meta: null,
      error: {
        code: "NOT_FOUND",
        message: "Record not found",
      },
    })
  }

  // Application errors
  if (err instanceof AppError) {
    return res.status(err.status).json({
      data: null,
      meta: null,
      error: {
        code: err.code,
        message: err.message,
        details: err.details ?? null,
      },
    })
  }

  // Default server error
  return res.status(500).json({
    data: null,
    meta: null,
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "Unexpected error",
    },
  })
}
