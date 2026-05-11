const ORIGINAL_ENV = process.env

function applyBaseEnv(overrides: NodeJS.ProcessEnv = {}) {
  process.env = {
    ...ORIGINAL_ENV,
    NODE_ENV: "test",
    DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/gestion_guias",
    JWT_ACCESS_SECRET: "a".repeat(32),
    JWT_REFRESH_SECRET: "b".repeat(32),
    REFRESH_TOKEN_PEPPER: "c".repeat(32),
    SEED_SUPERADMIN_EMAIL: "admin@test.com",
    SEED_SUPERADMIN_PASS: "Secret123456!",
    PASSWORD_PEPPER: "d".repeat(16),
    TOKEN_PEPPER: "e".repeat(16),
    LOG_LEVEL: "silent",
    ...overrides,
  }
}

function makePrismaMock() {
  return {
    guia: {
      findMany: jest.fn(),
    },
    recalada: {
      findUnique: jest.fn(),
    },
    atencion: {
      findUnique: jest.fn(),
    },
    usuario: {
      findUnique: jest.fn(),
    },
    notificationDelivery: {
      createMany: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    pushDeviceToken: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
      upsert: jest.fn(),
    },
  }
}

async function loadService(prisma: ReturnType<typeof makePrismaMock>) {
  jest.resetModules()
  jest.doMock("../../../prisma/client", () => ({ prisma }))
  jest.doMock("../../../libs/email", () => ({
    sendOperationalRecaladaCreatedEmail: jest.fn().mockResolvedValue(undefined),
    sendOperationalAtencionCreatedEmail: jest.fn().mockResolvedValue(undefined),
  }))
  jest.doMock("../../../libs/push", () => ({
    sendPushToTokens: jest.fn().mockResolvedValue({
      successCount: 1,
      failureCount: 0,
      invalidTokens: [],
    }),
  }))

  return {
    service: require("../../../modules/notifications/notification.service") as typeof import("../../../modules/notifications/notification.service"),
    email: require("../../../libs/email"),
    push: require("../../../libs/push"),
  }
}

const guide = {
  id: "guia-1",
  usuario: {
    id: "user-1",
    email: "guia@example.com",
    nombres: "Ana",
    apellidos: "Guia",
  },
}

describe("notification service", () => {
  beforeEach(() => {
    applyBaseEnv()
  })

  afterEach(() => {
    process.env = ORIGINAL_ENV
    jest.restoreAllMocks()
    jest.dontMock("../../../prisma/client")
    jest.dontMock("../../../libs/email")
    jest.dontMock("../../../libs/push")
  })

  it("enqueues one email delivery per active guide for a new recalada", async () => {
    const prisma = makePrismaMock()
    prisma.guia.findMany.mockResolvedValue([guide])
    prisma.recalada.findUnique.mockResolvedValue({
      id: 10,
      codigoRecalada: "RA-2026-000010",
      fechaLlegada: new Date("2026-05-12T13:00:00.000Z"),
      fechaSalida: new Date("2026-05-12T22:00:00.000Z"),
      terminal: "Terminal",
      muelle: "Muelle 1",
      buque: { nombre: "Caribe Star" },
      paisOrigen: { nombre: "Panama" },
    })
    prisma.notificationDelivery.createMany.mockResolvedValue({ count: 1 })

    const { service } = await loadService(prisma)
    const result = await service.enqueueRecaladaCreatedNotification(10)

    expect(result).toEqual({ email: 1, push: 0 })
    expect(prisma.guia.findMany).toHaveBeenCalledWith({
      where: { usuario: { rol: "GUIA", activo: true } },
      select: expect.any(Object),
    })
    expect(prisma.notificationDelivery.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          type: "RECALADA_CREATED",
          channel: "EMAIL",
          userId: "user-1",
          guiaId: "guia-1",
          recaladaId: 10,
          atencionId: null,
          notificationId: "recalada:10:created",
        }),
      ],
    })
  })

  it("enqueues email and push deliveries when Firebase push is enabled", async () => {
    applyBaseEnv({ PUSH_NOTIFICATIONS_ENABLED: "true" })
    const prisma = makePrismaMock()
    prisma.guia.findMany.mockResolvedValue([guide])
    prisma.atencion.findUnique.mockResolvedValue({
      id: 20,
      recaladaId: 10,
      fechaInicio: new Date("2026-05-12T14:00:00.000Z"),
      fechaFin: new Date("2026-05-12T18:00:00.000Z"),
      turnosTotal: 30,
      descripcion: "Atencion operativa",
      recalada: {
        codigoRecalada: "RA-2026-000010",
        buque: { nombre: "Caribe Star" },
      },
    })
    prisma.notificationDelivery.createMany.mockResolvedValue({ count: 2 })

    const { service } = await loadService(prisma)
    const result = await service.enqueueAtencionCreatedNotification(20)

    expect(result).toEqual({ email: 1, push: 1 })
    expect(prisma.notificationDelivery.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ channel: "EMAIL", type: "ATENCION_CREATED" }),
        expect.objectContaining({ channel: "PUSH", type: "ATENCION_CREATED" }),
      ]),
    })
  })

  it("marks failed deliveries for retry without throwing from the dispatcher", async () => {
    const prisma = makePrismaMock()
    prisma.notificationDelivery.findMany.mockResolvedValue([
      {
        id: "delivery-1",
        type: "RECALADA_CREATED",
        channel: "EMAIL",
        userId: "missing-user",
        guiaId: "guia-1",
        recaladaId: 10,
        atencionId: null,
        notificationId: "recalada:10:created",
        title: "Nueva recalada programada",
        body: "Body",
        payload: { notificationId: "recalada:10:created", type: "RECALADA_CREATED", route: "/recaladas/10", recaladaId: 10, codigoRecalada: "RA-2026-000010" },
        attempts: 0,
      },
    ])
    prisma.usuario.findUnique.mockResolvedValue(null)
    prisma.notificationDelivery.update.mockResolvedValue({})

    const { service } = await loadService(prisma)
    const processed = await service.dispatchPendingNotificationDeliveries()

    expect(processed).toBe(0)
    expect(prisma.notificationDelivery.update).toHaveBeenCalledWith({
      where: { id: "delivery-1" },
      data: expect.objectContaining({
        status: "FAILED",
        attempts: 1,
        lastError: "Notification recipient user not found",
        nextRetryAt: expect.any(Date),
      }),
    })
  })

  it("sends push deliveries by active tokens and disables invalid tokens", async () => {
    applyBaseEnv({ PUSH_NOTIFICATIONS_ENABLED: "true" })
    const prisma = makePrismaMock()
    prisma.notificationDelivery.findMany.mockResolvedValue([
      {
        id: "delivery-1",
        type: "ATENCION_CREATED",
        channel: "PUSH",
        userId: "user-1",
        guiaId: "guia-1",
        recaladaId: 10,
        atencionId: 20,
        notificationId: "atencion:20:created",
        title: "Nueva atencion disponible",
        body: "Body",
        payload: { notificationId: "atencion:20:created", type: "ATENCION_CREATED", route: "/atenciones/20", recaladaId: 10, atencionId: 20, codigoRecalada: "RA-2026-000010" },
        attempts: 0,
      },
    ])
    prisma.pushDeviceToken.findMany.mockResolvedValue([{ token: "token-1" }])
    prisma.pushDeviceToken.updateMany.mockResolvedValue({ count: 1 })
    prisma.notificationDelivery.update.mockResolvedValue({})

    const { service, push } = await loadService(prisma)
    push.sendPushToTokens.mockResolvedValue({
      successCount: 0,
      failureCount: 1,
      invalidTokens: ["token-1"],
    })

    await service.dispatchPendingNotificationDeliveries()

    expect(prisma.pushDeviceToken.updateMany).toHaveBeenCalledWith({
      where: { token: { in: ["token-1"] } },
      data: { active: false, disabledAt: expect.any(Date) },
    })
  })
})

export {}
