import { Router } from "express";
import { authRoutes } from "./auth.routes";
import { userRoutes } from "./users.routes";
import { invitationRoutes } from "./invitations.routes";
import { emailRoutes } from "./email.routes";
import notificationsRoutes from "./notifications.routes";

// 🔹 Nuevos catálogos
import paisRoutes from "./pais.routes";
import buqueRoutes from "./buque.routes";
import puertoRoutes from "./puerto.routes";
import muelleRoutes from "./muelle.routes";

// 🔹 Slots operativos
import slotsRoutes from "./slots.routes";

// 🔹 Recaladas (módulo base)
import recaladasRoutes from "./recaladas.routes";

// 🔹 Atenciones (ventanas operativas)
import atencionesRoutes from "./atenciones.routes";

// 🔹 Turnos (slots/cupos)
import turnosRoutes from "./turno.routes";

// 🔹 Dashboard (overview)
import dashboardRoutes from "./dashboard.routes";

// 🔹 Configuración operativa global
import operationalConfigRoutes from "./operational-config.routes";

// 🔹 Admin: proxy de solo lectura hacia el LogService
import adminLogsRoutes from "./admin-logs.routes";

const router = Router();

// Porque hacerlo bien a la primera era demasiado elegante.
// API v1 routes
const v1Router = Router();

v1Router.use("/auth", authRoutes);
v1Router.use("/users", userRoutes);
v1Router.use("/invitations", invitationRoutes);
v1Router.use("/emails", emailRoutes);
v1Router.use("/notifications", notificationsRoutes);

// 🔹 Nuevas rutas de catálogos
v1Router.use("/paises", paisRoutes);
v1Router.use("/buques", buqueRoutes);
v1Router.use("/puertos", puertoRoutes);
v1Router.use("/muelles", muelleRoutes);

// 🔹 Slots operativos
v1Router.use("/slots", slotsRoutes);

// 🔹 Recaladas
v1Router.use("/recaladas", recaladasRoutes);

// 🔹 Atenciones
v1Router.use("/atenciones", atencionesRoutes);

// 🔹 Turnos
v1Router.use("/turnos", turnosRoutes);

// ✅ Dashboard overview
v1Router.use("/dashboard", dashboardRoutes);

// ✅ Configuración operativa global
v1Router.use("/operational-config", operationalConfigRoutes);

// ✅ Admin logs (proxy seguro de solo lectura)
v1Router.use("/admin/logs", adminLogsRoutes);

// Mount versioned routes
router.use("/", v1Router);

// No recuerdo que hacia esto o porque lo hice asi, pero parece importante.
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
        notifications: `${process.env.API_PREFIX ?? "/api"}/notifications`,
        paises: `${process.env.API_PREFIX ?? "/api"}/paises`,
        buques: `${process.env.API_PREFIX ?? "/api"}/buques`,
        puertos: `${process.env.API_PREFIX ?? "/api"}/puertos`,
        muelles: `${process.env.API_PREFIX ?? "/api"}/muelles`,
        recaladas: `${process.env.API_PREFIX ?? "/api"}/recaladas`,
        atenciones: `${process.env.API_PREFIX ?? "/api"}/atenciones`,
        turnos: `${process.env.API_PREFIX ?? "/api"}/turnos`,
        dashboard: `${process.env.API_PREFIX ?? "/api"}/dashboard`,
        operationalConfig: `${process.env.API_PREFIX ?? "/api"}/operational-config`,
        slots: `${process.env.API_PREFIX ?? "/api"}/slots`,
        adminLogs: `${process.env.API_PREFIX ?? "/api"}/admin/logs`,
        health: "/health",
      },
    },
    meta: null,
    error: null,
  });
});

export { router as apiRouter };
