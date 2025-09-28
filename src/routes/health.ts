import { Router } from "express"
import { ok } from "../libs/http"
import { prisma } from "../prisma/client"

export const router = Router()

router.get("/", async (_req, res) => {
  try {
    // Basic health check
    const healthData = {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV,
    }

    res.json(ok(healthData))
  } catch (error) {
    res.status(503).json({
      data: null,
      meta: null,
      error: {
        code: "SERVICE_UNAVAILABLE",
        message: "Health check failed",
      },
    })
  }
})

router.get("/ready", async (_req, res) => {
  try {
    // Check database connectivity
    await prisma.$queryRaw`SELECT 1`

    const readinessData = {
      status: "ready",
      timestamp: new Date().toISOString(),
      database: "connected",
    }

    res.json(ok(readinessData))
  } catch (error) {
    res.status(503).json({
      data: null,
      meta: null,
      error: {
        code: "SERVICE_UNAVAILABLE",
        message: "Service not ready",
        details: { database: "disconnected" },
      },
    })
  }
})
