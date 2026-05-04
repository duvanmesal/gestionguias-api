import rateLimit from "express-rate-limit"

const tooManyMessage = (msg = "Too many attempts, please try later.") => ({
  data: null,
  meta: null,
  error: { code: "TOO_MANY_REQUESTS", message: msg },
})

export const sensitiveLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooManyMessage(),
})

// Login: muy estricto (5 intentos / 15 min)
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: tooManyMessage("Too many login attempts. Try again in 15 minutes."),
})

// Refresh: permisivo (60 / 15 min)
export const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooManyMessage(),
})

// Logout-all: muy estricto (3 / hora)
export const logoutAllLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooManyMessage(),
})

// Change-password: solo cuenta intentos fallidos (exitosos no penalizan)
export const changePasswordLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: tooManyMessage("Too many password change attempts. Try again in 10 minutes."),
})

// Logout-all code request: authenticated, per-user, less aggressive for UX retries.
export const logoutAllCodeRequestLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req as any).user?.userId || req.ip || "unknown",
  message: tooManyMessage("Too many code requests. Try again in 10 minutes."),
})
