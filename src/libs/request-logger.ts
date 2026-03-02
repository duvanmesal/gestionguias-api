import pinoHttp from "pino-http"
import { logger } from "../libs/logger"

export const requestLogger = pinoHttp({
  logger,

  genReqId: (req, res) => {
    const incoming = req.headers["x-request-id"]
    const idFromHeader =
      typeof incoming === "string" && incoming.trim() ? incoming.trim() : null

    const idFromContext = (req as any).requestId as string | undefined
    const finalId = idFromContext ?? idFromHeader

    if (finalId) {
      res.setHeader("x-request-id", finalId)
      return finalId
    }

    // Si por alguna razón requestContext no corrió, pino-http generará uno interno
    return undefined as any
  },

  customLogLevel: (req, res, err) => {
    if (res.statusCode >= 400 && res.statusCode < 500) return "warn"
    if (res.statusCode >= 500 || err) return "error"
    if (res.statusCode >= 300 && res.statusCode < 400) return "silent"
    return "info"
  },
})