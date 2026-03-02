// src/types/express.d.ts
import "express"

declare module "express-serve-static-core" {
  interface Request {
    clientPlatform?: "WEB" | "MOBILE"

    requestId?: string
    startAt?: bigint | number

    user?: any
  }
}