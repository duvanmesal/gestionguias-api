import { Router } from "express"
import { authRoutes } from "./auth.routes"
import { userRoutes } from "./users.routes"

const router = Router()

// API v1 routes
const v1Router = Router()

v1Router.use("/auth", authRoutes)
v1Router.use("/users", userRoutes)

// Mount versioned routes
router.use("/v1", v1Router)

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
        health: "/health",
      },
    },
    meta: null,
    error: null,
  })
})

export { router as apiRouter }
