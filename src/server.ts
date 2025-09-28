import app from "./app"
import { env } from "./config/env"
import { logger } from "./libs/logger"
import { prisma } from "./prisma/client"

async function startServer() {
  try {
    // Test database connection
    await prisma.$connect()
    logger.info("Database connected successfully")

    // Start HTTP server
    const server = app.listen(env.PORT, () => {
      logger.info(
        {
          port: env.PORT,
          environment: env.NODE_ENV,
          cors: env.CORS_ORIGINS,
        },
        "Server started successfully",
      )
    })

    // Graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      logger.info(`${signal} received, starting graceful shutdown`)

      server.close(async () => {
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
