import rateLimit from "express-rate-limit"

export const sensitiveLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    data: null,
    meta: null,
    error: { code: "TOO_MANY_REQUESTS", message: "Too many attempts, please try later." },
  },
})
