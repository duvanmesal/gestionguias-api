import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { AppError } from "../libs/errors";
import { logger } from "../libs/logger";
import { env } from "../config/env";

/**
 * Global error handler middleware.
 * - Maneja errores de validación (Zod)
 * - Errores de Prisma
 * - Errores personalizados (AppError)
 * - Cualquier error inesperado (500)
 */
export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {

  if (err?.type === "entity.parse.failed" || (err instanceof SyntaxError && "body" in err)) {
    logger.error({ err }, "Bad JSON payload");
    return res.status(400).json({
      data: null,
      meta: null,
      error: {
        code: "BAD_JSON",
        message: "Malformed JSON in request body",
        details: process.env.NODE_ENV !== "production" ? err.message : undefined,
      },
    });
  }

  logger.error("🔥 Unhandled error", {
    err,
    name: err?.name,
    code: err?.code,
    message: err?.message,
    stack: err?.stack,
    details: err?.details,
  } as any);

  if (err instanceof ZodError) {
    return res.status(400).json({
      data: null,
      meta: null,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid input",
        details: err.flatten(),
        stack: env.NODE_ENV !== "production" ? err.stack : undefined,
      },
    });
  }

  if (err?.code === "P2002") {
    return res.status(409).json({
      data: null,
      meta: null,
      error: {
        code: "CONFLICT",
        message: "Unique constraint failed",
        details: err.meta,
        stack: env.NODE_ENV !== "production" ? err.stack : undefined,
      },
    });
  }

  if (err?.code === "P2025") {
    return res.status(404).json({
      data: null,
      meta: null,
      error: {
        code: "NOT_FOUND",
        message: "Record not found",
        stack: env.NODE_ENV !== "production" ? err.stack : undefined,
      },
    });
  }

  if (err?.clientVersion && err?.meta && err?.code?.startsWith("P")) {
    return res.status(500).json({
      data: null,
      meta: null,
      error: {
        code: `PRISMA_${err.code}`,
        message: err.message,
        details: err.meta,
        stack: env.NODE_ENV !== "production" ? err.stack : undefined,
      },
    });
  }

  if (err instanceof AppError) {
    return res.status(err.status).json({
      data: null,
      meta: null,
      error: {
        code: err.code,
        message: err.message,
        details: err.details ?? null,
        stack: env.NODE_ENV !== "production" ? err.stack : undefined,
      },
    });
  }

  return res.status(500).json({
    data: null,
    meta: null,
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: env.NODE_ENV === "production" ? "Unexpected error" : err?.message ?? "Unexpected error",
      name: err?.name,
      details: env.NODE_ENV !== "production" ? (err?.details ?? null) : null,
      stack: env.NODE_ENV !== "production" ? err?.stack : undefined,
    },
  });
}
