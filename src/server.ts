import { createServer } from "http"
import app from "./app"
import { env } from "./config/env"
import { logger } from "./libs/logger"
import { prisma } from "./prisma/client"
import { initSocketGateway } from "./core/socket/socket.gateway"
import { startTurnoAutomationsJob } from "./core/jobs/turno-automations.job"
import { startNotificationDeliveryJob } from "./core/jobs/notification-delivery.job"

async function startServer() {
  try {
    // Test database connection
    await prisma.$connect()
    logger.info("Database connected successfully")

    const httpServer = createServer(app)
    initSocketGateway(httpServer)
    startTurnoAutomationsJob()
    startNotificationDeliveryJob()

    // Start HTTP server
    httpServer.listen(env.PORT, () => {
      logger.info(
        {
          port: env.PORT,
          environment: env.NODE_ENV,
          cors: env.CORS_ALLOWED_ORIGINS,
        },
        "Server started successfully",
      )
    })

    // Graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      logger.info(`${signal} received, starting graceful shutdown`)

      httpServer.close(async () => {
        logger.info("HTTP server closed")

        try {
          await prisma.$disconnect()
          logger.info("Database disconnected")
          process.exit(0)
        } catch (error) {
          logger.error(error, "Error during database disconnect")
          process.exit(1)
        }
      })
    }

    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"))
    process.on("SIGINT", () => gracefulShutdown("SIGINT"))
  } catch (error) {
    logger.error(error, "Failed to start server")
    process.exit(1)
  }
}

startServer()
