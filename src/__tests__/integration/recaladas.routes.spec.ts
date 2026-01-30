import express from "express"
import request from "supertest"
import recaladasRoutes from "../../routes/recaladas.routes"
import { errorHandler } from "../../middlewares/error-handler"

jest.mock("../../modules/recaladas/recalada.controller", () => ({
  RecaladaController: {
    create: jest.fn((req: any, res: any) =>
      res.status(201).json({
        data: {
          id: 1,
          codigoRecalada: "RA-2026-000001",
          ...req.body,
        },
        meta: null,
        error: null,
      }),
    ),
  },
}))

/**
 * Mock de auth/rbac:
 * - requireAuth: inyecta req.user desde headers de prueba
 *   - x-test-user: userId
 *   - x-test-role: rol (SUPER_ADMIN / SUPERVISOR / GUIA)
 *   Default: SUPERVISOR
 */
jest.mock("../../libs/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    const role = (req.header("x-test-role") || "SUPERVISOR") as string
    const userId = (req.header("x-test-user") || "u-auth") as string
    req.user = { userId, rol: role }
    next()
  },
}))

jest.mock("../../libs/rbac", () => ({
  requireSupervisor: (req: any, res: any, next: any) => {
    const role = req.user?.rol
    if (role === "SUPERVISOR" || role === "SUPER_ADMIN") return next()
    return res.status(403).json({ data: null, meta: null, error: { code: "FORBIDDEN" } })
  },
}))

const makeApp = () => {
  const app = express()
  app.use(express.json())
  app.use("/api/v1/recaladas", recaladasRoutes)
  app.use(errorHandler)
  return app
}

const http = () => request(makeApp())

describe("recaladas.routes RBAC + validate", () => {
  afterEach(() => jest.clearAllMocks())

  test("POST /: 403 si rol no es SUPERVISOR/SUPER_ADMIN", async () => {
    const res = await http()
      .post("/api/v1/recaladas")
      .set("x-test-role", "GUIA")
      .set("x-test-user", "u-guia")
      .send({
        buqueId: 1,
        paisOrigenId: 1,
        fechaLlegada: "2026-02-01T10:00:00.000Z",
      })

    expect(res.status).toBe(403)
    expect(res.body?.error?.code).toBe("FORBIDDEN")
  })

  test("POST /: 400 si body inválido (Zod)", async () => {
    const res = await http()
      .post("/api/v1/recaladas")
      .set("x-test-role", "SUPERVISOR")
      .set("x-test-user", "u-sup")
      .send({
        buqueId: "no-es-numero",
        // falta paisOrigenId, fechaLlegada...
      })

    expect(res.status).toBe(400)
    expect(res.body?.error?.code).toBe("VALIDATION_ERROR")
  })

  test("POST /: 400 si fechaSalida < fechaLlegada", async () => {
    const res = await http()
      .post("/api/v1/recaladas")
      .set("x-test-role", "SUPERVISOR")
      .set("x-test-user", "u-sup")
      .send({
        buqueId: 1,
        paisOrigenId: 1,
        fechaLlegada: "2026-02-02T10:00:00.000Z",
        fechaSalida: "2026-02-01T10:00:00.000Z",
      })

    expect(res.status).toBe(400)
    expect(res.body?.error?.code).toBe("VALIDATION_ERROR")
  })

  test("POST /: 201 si rol SUPERVISOR y body válido", async () => {
    const ok = await http()
      .post("/api/v1/recaladas")
      .set("x-test-role", "SUPERVISOR")
      .set("x-test-user", "u-sup")
      .send({
        buqueId: 10,
        paisOrigenId: 3,
        fechaLlegada: "2026-02-01T10:00:00.000Z",
        terminal: "Terminal 1",
        muelle: "Muelle A",
        pasajerosEstimados: 2500,
        tripulacionEstimada: 1200,
        observaciones: "Llegada prevista",
        fuente: "MANUAL",
      })

    expect(ok.status).toBe(201)
    expect(ok.body?.data?.buqueId).toBe(10)
    expect(ok.body?.data?.paisOrigenId).toBe(3)
  })

  test("POST /: 201 si rol SUPER_ADMIN y body válido", async () => {
    const ok = await http()
      .post("/api/v1/recaladas")
      .set("x-test-role", "SUPER_ADMIN")
      .set("x-test-user", "u-admin")
      .send({
        buqueId: 1,
        paisOrigenId: 1,
        fechaLlegada: "2026-02-01T10:00:00.000Z",
      })

    expect(ok.status).toBe(201)
  })
})
