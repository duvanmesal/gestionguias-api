import express from "express"
import request from "supertest"

import {
  BadGatewayError,
  GatewayTimeoutError,
  ServiceUnavailableError,
} from "../../libs/errors"

/**
 * Mock del cliente de SOLO LECTURA al LogService.
 * Permite simular envelopes, timeouts y caídas sin red real.
 */
const listMock = jest.fn()
const statsMock = jest.fn()
const getByIdMock = jest.fn()

jest.mock("../../modules/admin-logs/admin-logs.client", () => ({
  adminLogsClient: {
    list: (...args: any[]) => listMock(...args),
    stats: (...args: any[]) => statsMock(...args),
    getById: (...args: any[]) => getByIdMock(...args),
  },
  isAdminLogsConfigured: () => true,
}))

// Auditoría: no-op, no debe tocar la red en tests.
jest.mock("../../libs/logs/logs.service", () => ({
  logsService: { audit: jest.fn(), httpLog: jest.fn() },
}))

// Auth: inyecta req.user desde headers de prueba.
jest.mock("../../libs/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = {
      userId: req.header("x-test-user") || "u-auth",
      rol: req.header("x-test-role") || "SUPERVISOR",
      email: "tester@corpoturismo.test",
    }
    next()
  },
}))

// Plataforma + perfil + rate-limit: pass-through controlado.
jest.mock("../../middlewares/clientPlatform", () => ({
  detectClientPlatform: (req: any, _res: any, next: any) => {
    req.clientPlatform = "WEB"
    next()
  },
}))
jest.mock("../../middlewares/require-completed-profile", () => ({
  requireCompletedProfile: (_req: any, _res: any, next: any) => next(),
}))
jest.mock("../../middlewares/rate-limit", () => ({
  adminLogsLimiter: (_req: any, _res: any, next: any) => next(),
  adminLogsExportLimiter: (_req: any, _res: any, next: any) => next(),
}))

// RBAC real-ish: SUPER_ADMIN/SUPERVISOR pasan, GUIA es 403.
jest.mock("../../libs/rbac", () => ({
  requireSupervisor: (req: any, res: any, next: any) => {
    const role = req.user?.rol
    if (role === "SUPERVISOR" || role === "SUPER_ADMIN") return next()
    return res.status(403).json({ data: null, meta: null, error: { code: "FORBIDDEN" } })
  },
  requireSuperAdmin: (req: any, res: any, next: any) => {
    const role = req.user?.rol
    if (role === "SUPER_ADMIN") return next()
    return res.status(403).json({ data: null, meta: null, error: { code: "FORBIDDEN" } })
  },
}))

import adminLogsRoutes from "../../routes/admin-logs.routes"
import { errorHandler } from "../../middlewares/error-handler"

const makeApp = () => {
  const app = express()
  app.use(express.json())
  app.use("/api/v1/admin/logs", adminLogsRoutes)
  app.use(errorHandler)
  return app
}

const http = () => request(makeApp())

const asSupervisor = (r: request.Test) =>
  r.set("x-test-role", "SUPERVISOR").set("x-test-user", "u-sup")

describe("admin-logs proxy routes", () => {
  afterEach(() => jest.clearAllMocks())

  test("GET /: 403 para rol GUIA", async () => {
    const res = await http().get("/api/v1/admin/logs").set("x-test-role", "GUIA")
    expect(res.status).toBe(403)
    expect(res.body?.error?.code).toBe("FORBIDDEN")
    expect(listMock).not.toHaveBeenCalled()
  })

  test("GET /: 200 para SUPERVISOR y mapea limit->pageSize, action->event, userId->actorUserId", async () => {
    listMock.mockResolvedValue({
      data: [{ id: "1", level: "error" }],
      meta: { page: 1, pageSize: 50, total: 1, totalPages: 1 },
      error: null,
    })

    const res = await asSupervisor(
      http().get("/api/v1/admin/logs").query({
        page: "2",
        limit: "50",
        level: "error",
        action: "auth.login",
        userId: "user-123",
      }),
    )

    expect(res.status).toBe(200)
    expect(res.body?.data).toHaveLength(1)
    expect(res.body?.meta?.total).toBe(1)

    const sentQuery = listMock.mock.calls[0][0]
    expect(sentQuery).toMatchObject({
      page: 2,
      pageSize: 50,
      level: "error",
      event: "auth.login",
      actorUserId: "user-123",
      sort: "ts",
      order: "desc",
    })
    // No deben filtrarse los nombres de cara al frontend hacia el upstream.
    expect(sentQuery).not.toHaveProperty("limit")
    expect(sentQuery).not.toHaveProperty("action")
    expect(sentQuery).not.toHaveProperty("userId")
  })

  test("GET /: reenvía filtros avanzados method/statusCode/module (Fase 3)", async () => {
    listMock.mockResolvedValue({ data: [], meta: { page: 1, pageSize: 25, total: 0, totalPages: 1 }, error: null })

    await asSupervisor(
      http().get("/api/v1/admin/logs").query({
        method: "post",
        statusCode: "404",
        module: "auth",
      }),
    )

    const sentQuery = listMock.mock.calls[0][0]
    expect(sentQuery).toMatchObject({
      method: "post",
      statusCode: 404,
      module: "auth",
    })
  })

  test("GET /: 400 si query inválida (level fuera de enum)", async () => {
    const res = await asSupervisor(
      http().get("/api/v1/admin/logs").query({ level: "trace" }),
    )
    expect(res.status).toBe(400)
    expect(res.body?.error?.code).toBe("VALIDATION_ERROR")
    expect(listMock).not.toHaveBeenCalled()
  })

  test("GET /: acepta level=debug (Fase 6)", async () => {
    listMock.mockResolvedValue({ data: [], meta: { page: 1, pageSize: 25, total: 0, totalPages: 1 }, error: null })
    const res = await asSupervisor(http().get("/api/v1/admin/logs").query({ level: "debug" }))
    expect(res.status).toBe(200)
    expect(listMock.mock.calls[0][0]).toMatchObject({ level: "debug" })
  })

  test("GET /stats: 200 y reenvía envelope del upstream", async () => {
    statsMock.mockResolvedValue({
      data: { byLevel: [], topEvents: [], errorsByDay: [] },
      meta: null,
      error: null,
    })
    const res = await asSupervisor(http().get("/api/v1/admin/logs/stats"))
    expect(res.status).toBe(200)
    expect(res.body?.data).toHaveProperty("byLevel")
    expect(statsMock).toHaveBeenCalledTimes(1)
  })

  test("GET /:id: timeout del upstream -> 504 GATEWAY_TIMEOUT", async () => {
    getByIdMock.mockRejectedValue(new GatewayTimeoutError())
    const res = await asSupervisor(http().get("/api/v1/admin/logs/abc"))
    expect(res.status).toBe(504)
    expect(res.body?.error?.code).toBe("GATEWAY_TIMEOUT")
  })

  test("GET /: LogService caído -> 502 BAD_GATEWAY", async () => {
    listMock.mockRejectedValue(new BadGatewayError())
    const res = await asSupervisor(http().get("/api/v1/admin/logs"))
    expect(res.status).toBe(502)
    expect(res.body?.error?.code).toBe("BAD_GATEWAY")
  })

  test("GET /: READ key sin configurar -> 503 SERVICE_UNAVAILABLE", async () => {
    listMock.mockRejectedValue(new ServiceUnavailableError("Logs service is not configured"))
    const res = await asSupervisor(http().get("/api/v1/admin/logs"))
    expect(res.status).toBe(503)
    expect(res.body?.error?.code).toBe("SERVICE_UNAVAILABLE")
    // El secreto nunca aparece en la respuesta.
    expect(JSON.stringify(res.body)).not.toMatch(/api[_-]?key/i)
  })

  // ── Export (Fase 5) ─────────────────────────────────────────────
  const RANGE = { from: "2026-06-01T00:00:00.000Z", to: "2026-06-05T00:00:00.000Z" }

  test("GET /export: 400 si falta el rango de fechas obligatorio", async () => {
    const res = await asSupervisor(http().get("/api/v1/admin/logs/export").query({ format: "csv" }))
    expect(res.status).toBe(400)
    expect(res.body?.error?.code).toBe("VALIDATION_ERROR")
    expect(listMock).not.toHaveBeenCalled()
  })

  test("GET /export: 400 si el rango excede el máximo permitido", async () => {
    const res = await asSupervisor(
      http()
        .get("/api/v1/admin/logs/export")
        .query({ format: "csv", from: "2026-01-01T00:00:00.000Z", to: "2026-12-31T00:00:00.000Z" }),
    )
    expect(res.status).toBe(400)
  })

  test("GET /export: CSV con headers de descarga y filas escapadas", async () => {
    listMock.mockResolvedValue({
      data: [
        {
          ts: "2026-06-02T10:00:00.000Z",
          level: "error",
          service: "gestionguias-api",
          event: "auth.login",
          message: 'falló, "intento"',
          actor: { userId: "u1", email: "a@a.com" },
          http: { method: "POST", status: 500, durationMs: 12 },
          requestId: "req-1",
        },
      ],
      meta: { page: 1, pageSize: 200, total: 1, totalPages: 1 },
      error: null,
    })

    const res = await asSupervisor(http().get("/api/v1/admin/logs/export").query({ format: "csv", ...RANGE }))

    expect(res.status).toBe(200)
    expect(res.headers["content-type"]).toMatch(/text\/csv/)
    expect(res.headers["content-disposition"]).toMatch(/attachment; filename="logs-.*\.csv"/)
    expect(res.text).toContain("ts,level,service,event,message")
    expect(res.text).toContain("auth.login")
    // La comilla interna se dobla y la celda va entrecomillada.
    expect(res.text).toContain('"falló, ""intento"""')
    // El filtro se reenvía con el rango.
    expect(listMock.mock.calls[0][0]).toMatchObject({ from: RANGE.from, to: RANGE.to, sort: "ts" })
  })

  test("GET /export: JSON con content-type application/json", async () => {
    listMock.mockResolvedValue({
      data: [{ ts: "2026-06-02T10:00:00.000Z", level: "info", event: "x.y" }],
      meta: { page: 1, pageSize: 200, total: 1, totalPages: 1 },
      error: null,
    })

    const res = await asSupervisor(http().get("/api/v1/admin/logs/export").query({ format: "json", ...RANGE }))

    expect(res.status).toBe(200)
    expect(res.headers["content-type"]).toMatch(/application\/json/)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body[0]).toMatchObject({ event: "x.y" })
  })

  test("GET /export: 403 para rol GUIA", async () => {
    const res = await http()
      .get("/api/v1/admin/logs/export")
      .query({ format: "csv", ...RANGE })
      .set("x-test-role", "GUIA")
    expect(res.status).toBe(403)
    expect(listMock).not.toHaveBeenCalled()
  })
})
