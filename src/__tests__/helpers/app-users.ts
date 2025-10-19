// src/__tests__/integration/helpers/app-users.ts
import express from "express"
import request from "supertest"
import { userRoutes } from "../../routes/users.routes"
import { errorHandler } from "../../middlewares/error-handler"

export const makeApp = () => {
  const app = express()
  app.use(express.json())
  app.use("/api/v1/users", userRoutes)
  app.use(errorHandler) // 👈 muy importante: convierte ZodError → 400 VALIDATION_ERROR, AppError → status, etc.
  return app
}

export const http = () => request(makeApp())
