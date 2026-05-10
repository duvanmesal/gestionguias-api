import { Server as SocketServer } from "socket.io"
import type { Server as HttpServer } from "http"
import { verifyAccessToken } from "../../libs/jwt"
import { corsOrigins } from "../../config/env"
import { logger } from "../../libs/logger"
import { prisma } from "../../prisma/client"
import { socketService } from "./socket.service"

const SKEW_MS = 3000

type JoinAck = (result: { ok: boolean; error?: string }) => void
type SocketRole = "SUPER_ADMIN" | "SUPERVISOR" | "GUIA"

export function initSocketGateway(httpServer: HttpServer): void {
  const io = new SocketServer(httpServer, {
    cors: {
      origin: corsOrigins,
      credentials: true,
    },
    path: "/socket.io",
  })

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined
      if (!token) return next(new Error("No token provided"))

      const payload = verifyAccessToken(token)
      if (!payload.sid) return next(new Error("Session ID not found in token"))

      const session = await prisma.session.findUnique({
        where: { id: payload.sid },
        select: {
          id: true,
          revokedAt: true,
          refreshExpiresAt: true,
          lastRotatedAt: true,
          user: {
            select: {
              id: true,
              activo: true,
              rol: true,
            },
          },
        },
      })

      if (!session) return next(new Error("Session not found"))
      if (session.revokedAt) return next(new Error("Session has been revoked"))
      if (session.refreshExpiresAt && session.refreshExpiresAt < new Date()) {
        return next(new Error("Session expired"))
      }
      if (!session.user.activo) return next(new Error("User account is inactive"))
      if (session.user.id !== payload.userId || session.user.rol !== payload.rol) {
        return next(new Error("Token session mismatch"))
      }
      if (session.lastRotatedAt && payload.iat) {
        const tokenIatMs = payload.iat * 1000
        if (tokenIatMs + SKEW_MS < session.lastRotatedAt.getTime()) {
          return next(new Error("Access token outdated due to refresh rotation"))
        }
      }

      socket.data.userId = payload.userId
      socket.data.rol = payload.rol
      socket.data.sid = payload.sid
      next()
    } catch {
      next(new Error("Invalid or expired token"))
    }
  })

  io.on("connection", (socket) => {
    const { userId, rol, sid } = socket.data as {
      userId: string
      rol: SocketRole
      sid: string
    }
    logger.info({ userId, rol, sid }, "[Socket] client connected")

    socket.join(`user:${userId}`)
    socket.join(`session:${sid}`)

    if (rol === "GUIA") {
      socket.join(`guia:${userId}`)
      socket.join("guias")
    }

    if (rol === "SUPERVISOR" || rol === "SUPER_ADMIN") {
      socket.join("supervisors")
    }

    if (rol === "SUPER_ADMIN") {
      socket.join("admins")
    }

    socket.on("join:atencion", async (rawAtencionId: unknown, ack?: JoinAck) => {
      const atencionId = normalizePositiveInt(rawAtencionId, "atencionId")
      if (!atencionId) return rejectJoin(ack, "Invalid atencion id")

      const allowed = await canJoinAtencionRoom(atencionId)
      if (!allowed) {
        logger.warn({ userId, rol, atencionId }, "[Socket] join:atencion rejected")
        return rejectJoin(ack, "Atencion not found or not authorized")
      }

      socket.join(`atencion:${atencionId}`)
      ack?.({ ok: true })
    })

    socket.on("leave:atencion", (rawAtencionId: unknown, ack?: JoinAck) => {
      const atencionId = normalizePositiveInt(rawAtencionId, "atencionId")
      if (!atencionId) return rejectJoin(ack, "Invalid atencion id")

      socket.leave(`atencion:${atencionId}`)
      ack?.({ ok: true })
    })

    socket.on("join:recalada", async (rawRecaladaId: unknown, ack?: JoinAck) => {
      const recaladaId = normalizePositiveInt(rawRecaladaId, "recaladaId")
      if (!recaladaId) return rejectJoin(ack, "Invalid recalada id")

      const allowed = await canJoinRecaladaRoom(recaladaId)
      if (!allowed) {
        logger.warn({ userId, rol, recaladaId }, "[Socket] join:recalada rejected")
        return rejectJoin(ack, "Recalada not found or not authorized")
      }

      socket.join(`recalada:${recaladaId}`)
      ack?.({ ok: true })
    })

    socket.on("leave:recalada", (rawRecaladaId: unknown, ack?: JoinAck) => {
      const recaladaId = normalizePositiveInt(rawRecaladaId, "recaladaId")
      if (!recaladaId) return rejectJoin(ack, "Invalid recalada id")

      socket.leave(`recalada:${recaladaId}`)
      ack?.({ ok: true })
    })

    socket.on("disconnect", () => {
      logger.info({ userId, rol, sid }, "[Socket] client disconnected")
    })
  })

  socketService.init(io)
}

function normalizePositiveInt(value: unknown, key?: string): number | null {
  const raw =
    key && value && typeof value === "object"
      ? (value as Record<string, unknown>)[key] ?? (value as Record<string, unknown>).id
      : value
  const parsed = typeof raw === "number" ? raw : Number(raw)
  if (!Number.isInteger(parsed) || parsed <= 0) return null
  return parsed
}

function rejectJoin(ack: JoinAck | undefined, error: string): void {
  ack?.({ ok: false, error })
}

async function canJoinAtencionRoom(atencionId: number): Promise<boolean> {
  const atencion = await prisma.atencion.findUnique({
    where: { id: atencionId },
    select: { id: true },
  })

  return !!atencion
}

async function canJoinRecaladaRoom(recaladaId: number): Promise<boolean> {
  const recalada = await prisma.recalada.findUnique({
    where: { id: recaladaId },
    select: { id: true },
  })

  return !!recalada
}
