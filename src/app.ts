import express from "express"
import helmet from "helmet"
import cookieParser from "cookie-parser"
import { applyCors } from "./middlewares/cors"
import { requestLogger } from "./middlewares/request-logger"
import { errorHandler } from "./middlewares/error-handler"
import healthRouter from "./routes/health.routes"
import { apiRouter } from "./routes"
import { logger } from "./libs/logger"
import { env } from "./config/env"

const app = express()

app.set("trust proxy", 1)

// 1) Seguridad base
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
)

// 2) CORS SIEMPRE antes de parsers y rutas
applyCors(app)

// 3) Parsers (¡antes de montar routers!)
app.use(express.json({ limit: "1mb" }))
app.use(express.urlencoded({ extended: true, limit: "1mb" }))
app.use(cookieParser())

// 4) Logs
app.use(requestLogger)

// 5) Rutas públicas
app.use(`${env.API_PREFIX ?? "/api"}/health`, healthRouter)

app.use(env.API_PREFIX, apiRouter)

// 7) 404
app.use((_req, res) => {
  res.status(404).json({
    data: null,
    meta: null,
    error: { code: "NOT_FOUND", message: "Route not found" },
  })
})

// 8) Errores
app.use(errorHandler)

// 9) Shutdown
process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down gracefully")
  process.exit(0)
})
process.on("SIGINT", () => {
  logger.info("SIGINT received, shutting down gracefully")
  process.exit(0)
})

export default app
