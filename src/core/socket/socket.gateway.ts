import { Server as SocketServer } from "socket.io"
import type { Server as HttpServer } from "http"
import { verifyAccessToken } from "../../libs/jwt"
import { corsOrigins } from "../../config/env"
import { logger } from "../../libs/logger"
import { socketService } from "./socket.service"

export function initSocketGateway(httpServer: HttpServer): void {
  const io = new SocketServer(httpServer, {
    cors: {
      origin: corsOrigins,
      credentials: true,
    },
    path: "/socket.io",
  })

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined
      if (!token) return next(new Error("No token provided"))
      const payload = verifyAccessToken(token)
      socket.data.userId = payload.userId
      socket.data.rol = payload.rol
      next()
    } catch {
      next(new Error("Invalid or expired token"))
    }
  })

  io.on("connection", (socket) => {
    const { userId, rol } = socket.data as { userId: string; rol: string }
    logger.info({ userId, rol }, "[Socket] client connected")

    if (rol === "GUIA") {
      socket.join(`guia:${userId}`)
    } else if (rol === "SUPERVISOR" || rol === "SUPER_ADMIN") {
      socket.join("supervisors")
    }

    // Clients can subscribe to a specific atencion's events
    socket.on("join:atencion", (atencionId: number) => {
      socket.join(`atencion:${atencionId}`)
    })

    socket.on("leave:atencion", (atencionId: number) => {
      socket.leave(`atencion:${atencionId}`)
    })

    socket.on("disconnect", () => {
      logger.info({ userId, rol }, "[Socket] client disconnected")
    })
  })

  socketService.init(io)
}
