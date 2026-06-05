// Verifica el mapeo de errores del cliente de SOLO LECTURA al LogService y que
// la READ key viaje por x-api-key (nunca el JWT del usuario).
jest.mock("../../config/env", () => ({
  env: {
    LOGS_ENABLED: true,
    LOGS_SERVICE_URL: "https://logs.example.test",
    LOGS_READ_API_KEY: "read-key-supersecret-123456",
    LOGS_TIMEOUT_MS: 1000,
  },
}))

jest.mock("../../libs/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}))

import { adminLogsClient, isAdminLogsConfigured } from "../../modules/admin-logs/admin-logs.client"

const mockFetch = (impl: any) => {
  ;(global as any).fetch = jest.fn(impl)
}

const jsonResponse = (status: number, body: any) => ({
  status,
  json: async () => body,
})

describe("adminLogsClient error mapping", () => {
  afterEach(() => jest.clearAllMocks())

  test("isAdminLogsConfigured true con URL + READ key", () => {
    expect(isAdminLogsConfigured()).toBe(true)
  })

  test("list: 200 devuelve el envelope y envía x-api-key (no Authorization)", async () => {
    mockFetch(async () =>
      jsonResponse(200, { data: [{ id: "1" }], meta: { total: 1 }, error: null }),
    )

    const res = await adminLogsClient.list({ pageSize: 25 })
    expect(res.data).toEqual([{ id: "1" }])

    const [url, init] = (global as any).fetch.mock.calls[0]
    expect(url).toContain("https://logs.example.test/logs")
    expect(url).toContain("pageSize=25")
    expect(init.headers["x-api-key"]).toBe("read-key-supersecret-123456")
    expect(init.headers).not.toHaveProperty("authorization")
    expect(init.headers).not.toHaveProperty("Authorization")
  })

  test("timeout (AbortError) -> 504 GATEWAY_TIMEOUT", async () => {
    mockFetch(async () => {
      const err: any = new Error("aborted")
      err.name = "AbortError"
      throw err
    })
    await expect(adminLogsClient.list({})).rejects.toMatchObject({
      status: 504,
      code: "GATEWAY_TIMEOUT",
    })
  })

  test("error de red -> 502 BAD_GATEWAY", async () => {
    mockFetch(async () => {
      throw new Error("ECONNREFUSED")
    })
    await expect(adminLogsClient.list({})).rejects.toMatchObject({
      status: 502,
      code: "BAD_GATEWAY",
    })
  })

  test("upstream 401 -> 502 LOGS_SERVICE_AUTH_ERROR (sin exponer la key)", async () => {
    mockFetch(async () => jsonResponse(401, { error: { code: "UNAUTHORIZED" } }))
    await expect(adminLogsClient.list({})).rejects.toMatchObject({
      status: 502,
      code: "LOGS_SERVICE_AUTH_ERROR",
    })
  })

  test("upstream 404 en detalle -> 404 NOT_FOUND", async () => {
    mockFetch(async () => jsonResponse(404, { error: { code: "NOT_FOUND" } }))
    await expect(adminLogsClient.getById("nope")).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
    })
  })

  test("upstream 5xx -> 502 BAD_GATEWAY", async () => {
    mockFetch(async () => jsonResponse(503, { error: { code: "X" } }))
    await expect(adminLogsClient.stats({})).rejects.toMatchObject({
      status: 502,
      code: "BAD_GATEWAY",
    })
  })
})

describe("adminLogsClient sin configurar", () => {
  test("READ key vacía -> 503 SERVICE_UNAVAILABLE", async () => {
    jest.resetModules()
    jest.doMock("../../config/env", () => ({
      env: {
        LOGS_ENABLED: true,
        LOGS_SERVICE_URL: "https://logs.example.test",
        LOGS_READ_API_KEY: "",
        LOGS_TIMEOUT_MS: 1000,
      },
    }))
    jest.doMock("../../libs/logger", () => ({
      logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
    }))
    // require (no import dinámico) para re-evaluar con el env mockeado.
    const mod = require("../../modules/admin-logs/admin-logs.client") as typeof import("../../modules/admin-logs/admin-logs.client")
    await expect(mod.adminLogsClient.list({})).rejects.toMatchObject({
      status: 503,
      code: "SERVICE_UNAVAILABLE",
    })
  })
})
