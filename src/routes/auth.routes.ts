import { Router } from "express"
import { validate } from "../libs/zod-mw"
import { requireAuth } from "../libs/auth"
import { detectClientPlatform } from "../middlewares/clientPlatform"
import { authController } from "../modules/auth/auth.controller"
import { loginSchema, refreshSchema, registerSchema } from "../modules/auth/auth.schemas"

const router = Router()

router.post("/login", detectClientPlatform, validate({ body: loginSchema }), authController.login.bind(authController))

router.post(
  "/refresh",
  detectClientPlatform,
  validate({ body: refreshSchema }),
  authController.refresh.bind(authController),
)

router.post("/logout", detectClientPlatform, requireAuth, authController.logout.bind(authController))

// Optional registration endpoint (can be disabled in production)
router.post("/register", validate({ body: registerSchema }), authController.register.bind(authController))

router.post("/logout-all", detectClientPlatform, requireAuth, authController.logoutAll.bind(authController))
router.get("/me", requireAuth, authController.me.bind(authController))

router.get("/sessions", requireAuth, authController.sessions.bind(authController))
router.delete("/sessions/:sessionId", requireAuth, authController.revokeSession.bind(authController))

export { router as authRoutes }
