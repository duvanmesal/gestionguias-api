import { Router } from "express";
import { authRoutes } from "./auth.routes";
import { userRoutes } from "./users.routes";
import { invitationRoutes } from "./invitations.routes";
import { emailRoutes } from "./email.routes";

const router = Router();

// API v1 routes
const v1Router = Router();

v1Router.use("/auth", authRoutes);
v1Router.use("/users", userRoutes);
v1Router.use("/invitations", invitationRoutes);
v1Router.use("/emails", emailRoutes); // ← aquí montamos emails

// Mount versioned routes
router.use("/v1", v1Router);

// API info endpoint
router.get("/", (_req, res) => {
  res.json({
    data: {
      name: "Gestión Guías API",
      version: "1.0.0",
      description: "API para gestión de turnos de guías turísticos",
      endpoints: {
        auth: "/api/v1/auth",
        users: "/api/v1/users",
        invitations: "/api/v1/invitations",
        emails: "/api/v1/emails",
        health: "/health",
      },
    },
    meta: null,
    error: null,
  });
});

export { router as apiRouter };
