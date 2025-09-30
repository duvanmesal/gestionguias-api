import { Router } from "express"
import { validate } from "../libs/zod-mw"
import { requireAuth } from "../libs/auth"
import { authController } from "../modules/auth/auth.controller"
import { loginSchema, refreshSchema, registerSchema } from "../modules/auth/auth.schemas"

const router = Router()

// Public routes
router.post("/login", validate({ body: loginSchema }), authController.login.bind(authController))
router.post("/refresh", validate({ body: refreshSchema }), authController.refresh.bind(authController))
router.post("/logout", validate({ body: refreshSchema }), authController.logout.bind(authController))

// Optional registration endpoint (can be disabled in production)
router.post("/register", validate({ body: registerSchema }), authController.register.bind(authController))

// Protected routes
router.post("/logout-all", requireAuth, authController.logoutAll.bind(authController))
router.get("/me", requireAuth, authController.me.bind(authController))

export { router as authRoutes }
