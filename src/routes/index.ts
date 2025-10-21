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
router.use("/", v1Router);

// API info endpoint
router.get("/", (_req, res) => {
  res.json({
    data: {
      name: "Gestión Guías API",
      version: "1.0.0",
      description: "API para gestión de turnos de guías turísticos",
      endpoints: {
        auth: `${process.env.API_PREFIX ?? "/api"}/auth`,
        users: `${process.env.API_PREFIX ?? "/api"}/users`,
        invitations: `${process.env.API_PREFIX ?? "/api"}/invitations`,
        emails: `${process.env.API_PREFIX ?? "/api"}/emails`,
        health: "/health",
      },
    },
    meta: null,
    error: null,
  });
});

export { router as apiRouter };
