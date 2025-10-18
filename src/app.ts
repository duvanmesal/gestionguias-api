import express from "express"
import helmet from "helmet"
import cors from "cors"
import cookieParser from "cookie-parser"
import { corsOrigins } from "./config/env"
import { requestLogger } from "./middlewares/request-logger"
import { errorHandler } from "./middlewares/error-handler"
import { requireCompletedProfile } from "./middlewares/require-completed-profile"
import healthRouter from "./routes/health.routes"
import { apiRouter } from "./routes"
import { logger } from "./libs/logger"

const app = express()

// Security middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
  }),
)

// CORS configuration
app.use(
  cors({
    origin: corsOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "X-Client-Platform"],
  }),
)

// Body parsing middleware
app.use(express.json({ limit: "1mb" }))
app.use(express.urlencoded({ extended: true, limit: "1mb" }))

app.use(cookieParser())

// Request logging
app.use(requestLogger)

// Health check routes (no auth required)
app.use("/health", healthRouter);

// API routes with versioning
app.use("/api", apiRouter)

app.use("/api", requireCompletedProfile)

// 404 handler for unmatched routes
app.use((_req, res) => {
  res.status(404).json({
    data: null,
    meta: null,
    error: {
      code: "NOT_FOUND",
      message: "Route not found",
    },
  })
})

// Global error handler (must be last)
app.use(errorHandler)

// Graceful shutdown handling
process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down gracefully")
  process.exit(0)
})

process.on("SIGINT", () => {
  logger.info("SIGINT received, shutting down gracefully")
  process.exit(0)
})

export default app
