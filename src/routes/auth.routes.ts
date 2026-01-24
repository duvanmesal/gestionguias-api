import { Router } from "express";
import { validate } from "../libs/zod-mw";
import { requireAuth } from "../libs/auth";
import { detectClientPlatform } from "../middlewares/clientPlatform";
import { authController } from "../modules/auth/auth.controller";
import {
  loginSchema,
  refreshSchema,
  logoutAllSchema,
  changePasswordSchema,
} from "../modules/auth/auth.schemas";
import { sensitiveLimiter } from "../middlewares/rate-limit";

const router = Router();

router.post(
  "/login",
  sensitiveLimiter,
  detectClientPlatform,
  validate({ body: loginSchema }),
  authController.login.bind(authController),
);

router.post(
  "/refresh",
  detectClientPlatform,
  validate({ body: refreshSchema }),
  authController.refresh.bind(authController),
);

router.post(
  "/logout",
  detectClientPlatform,
  requireAuth,
  authController.logout.bind(authController),
);

/*
router.post(
  "/auth/logout-all",
  sensitiveLimiter,
  detectClientPlatform,
  requireAuth,
  validate({ body: logoutAllSchema }),
  authController.logoutAll,
)
*/

// router.post("/register", validate({ body: registerSchema }), authController.register.bind(authController));

router.post(
  "/logout-all",
  detectClientPlatform,
  requireAuth,
  authController.logoutAll.bind(authController),
);

router.get("/me", requireAuth, authController.me.bind(authController));

router.get(
  "/sessions",
  requireAuth,
  authController.sessions.bind(authController),
);

router.delete(
  "/sessions/:sessionId",
  requireAuth,
  authController.revokeSession.bind(authController),
);

// cambiar contraseña
router.post(
  "/change-password",
  sensitiveLimiter,
  detectClientPlatform,
  requireAuth,
  validate({ body: changePasswordSchema }),
  authController.changePassword.bind(authController),
);

export { router as authRoutes };
