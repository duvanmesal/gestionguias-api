import { Request, Response, NextFunction } from "express";
import { prisma } from "../../prisma/client";

export async function liveness(req: Request, res: Response, next: NextFunction) {
  try {
    // Intentamos un ping rápido a la DB. Si falla, consideramos el servicio no saludable.
    await prisma.$queryRaw`SELECT 1`;
    return res.status(200).json({
      data: { service: "ok", databaseStatus: "connected" },
      meta: null,
      error: null,
    });
  } catch (err) {
    return res.status(503).json({
      data: null,
      meta: null,
      error: { code: "SERVICE_UNAVAILABLE", message: "Database not reachable" },
    });
  }
}

export async function readiness(req: Request, res: Response, next: NextFunction) {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return res.status(200).json({
      data: { databaseStatus: "connected" },
      meta: null,
      error: null,
    });
  } catch (err) {
    return res.status(503).json({
      data: null,
      meta: null,
      error: { code: "SERVICE_UNAVAILABLE", message: "Database not reachable" },
    });
  }
}
