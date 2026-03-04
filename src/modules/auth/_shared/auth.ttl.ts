import { env } from "../../../config/env"
import { parseTtlToSeconds } from "../../../libs/time"

export const ACCESS_TTL_SEC = parseTtlToSeconds(env.JWT_ACCESS_TTL, 900) // 15m por defecto
export const REFRESH_TTL_SEC = parseTtlToSeconds(env.JWT_REFRESH_TTL, 60 * 60 * 24 * 30) // 30d por defecto