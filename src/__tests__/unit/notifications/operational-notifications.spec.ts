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
    PUSH_NOTIFICATIONS_ENABLED: "true",
    ...overrides,
  }
}

function makePrismaMock() {
  return {
    guia: { findMany: jest.fn() },
    guiaPenalty: { findMany: jest.fn() },
    usuario: { findMany: jest.fn() },
    notificationDelivery: { createMany: jest.fn() },
  }
}

function makeSocketMock() {
  return {
    emitToGuia: jest.fn(),
    emitToUser: jest.fn(),
    emitToSupervisors: jest.fn(),
    emitToAdmins: jest.fn(),
    emitToAtencion: jest.fn(),
    emitToRecalada: jest.fn(),
    emitToAllGuias: jest.fn(),
  }
}

async function loadHelpers(
  prisma: ReturnType<typeof makePrismaMock>,
  socket: ReturnType<typeof makeSocketMock>,
) {
  jest.resetModules()
  jest.doMock("../../../prisma/client", () => ({ prisma }))
  jest.doMock("../../../core/socket/socket.service", () => ({ socketService: socket }))

  return require("../../../modules/notifications/operational-notifications") as typeof import("../../../modules/notifications/operational-notifications")
}

beforeEach(() => {
  applyBaseEnv()
})

export {}

afterAll(() => {
  process.env = ORIGINAL_ENV
})

describe("Epica 7 — Operational notifications", () => {
  describe("notifyAtencionAvailableToGuides — destinatarios elegibles", () => {
    it("incluye guías activos, disponibles y sin penalización vigente; excluye penalizados", async () => {
      const prisma = makePrismaMock()
      const socket = makeSocketMock()

      prisma.guia.findMany.mockResolvedValue([
        { id: "g1", pendingPenalty: false, usuario: { id: "u1" } },
        { id: "g2", pendingPenalty: true, usuario: { id: "u2" } },
        { id: "g3", pendingPenalty: false, usuario: { id: "u3" } },
      ])
      // g2 tiene penalización vigente → debe quedar excluido.
      prisma.guiaPenalty.findMany.mockResolvedValue([{ guiaId: "g2" }])
      prisma.notificationDelivery.createMany.mockResolvedValue({ count: 2 })

      const helpers = await loadHelpers(prisma, socket)
      const result = await helpers.notifyAtencionAvailableToGuides({
        atencionId: 100,
        recaladaId: 50,
        codigoRecalada: "REC-001",
      })

      expect(result.recipients).toBe(2)
      expect(result.push).toBe(2)
      expect(prisma.notificationDelivery.createMany).toHaveBeenCalledTimes(1)
      const args = prisma.notificationDelivery.createMany.mock.calls[0][0]
      expect(args.skipDuplicates).toBe(true)
      const userIds = args.data.map((d: any) => d.userId).sort()
      expect(userIds).toEqual(["u1", "u3"])
      // Cada entrega es push con type correcto
      expect(args.data.every((d: any) => d.channel === "PUSH")).toBe(true)
      expect(args.data.every((d: any) => d.type === "ATENCION_AVAILABLE_FOR_GUIDE")).toBe(true)
      // Sockets emitidos a cada guía elegible
      expect(socket.emitToGuia).toHaveBeenCalledTimes(2)
    })

    it("no encola entregas si push está deshabilitado", async () => {
      applyBaseEnv({ PUSH_NOTIFICATIONS_ENABLED: "false" })
      const prisma = makePrismaMock()
      const socket = makeSocketMock()

      prisma.guia.findMany.mockResolvedValue([
        { id: "g1", pendingPenalty: false, usuario: { id: "u1" } },
      ])
      prisma.guiaPenalty.findMany.mockResolvedValue([])
      prisma.notificationDelivery.createMany.mockResolvedValue({ count: 0 })

      const helpers = await loadHelpers(prisma, socket)
      const result = await helpers.notifyAtencionAvailableToGuides({
        atencionId: 100,
        recaladaId: 50,
      })

      expect(result.recipients).toBe(1)
      expect(result.push).toBe(0)
      expect(prisma.notificationDelivery.createMany).not.toHaveBeenCalled()
      // Pero el socket sí se emite
      expect(socket.emitToGuia).toHaveBeenCalledTimes(1)
    })
  })

  describe("notifyTurnoClaimedToGuide — payload + dedup id", () => {
    it("usa notificationId estable y emite socket al guía", async () => {
      const prisma = makePrismaMock()
      const socket = makeSocketMock()
      prisma.notificationDelivery.createMany.mockResolvedValue({ count: 1 })

      const helpers = await loadHelpers(prisma, socket)
      await helpers.notifyTurnoClaimedToGuide({
        turnoId: 7,
        atencionId: 10,
        recaladaId: 3,
        codigoRecalada: "REC-003",
        guiaUserId: "user-1",
        guiaId: "g-1",
        fechaInicio: new Date("2026-06-01T08:00:00Z"),
        fechaFin: new Date("2026-06-01T16:00:00Z"),
      })

      const args = prisma.notificationDelivery.createMany.mock.calls[0][0]
      expect(args.skipDuplicates).toBe(true)
      expect(args.data[0].notificationId).toBe("turno:7:claimed")
      expect(args.data[0].turnoId).toBe(7)
      expect(args.data[0].type).toBe("TURNO_CLAIMED")
      expect(socket.emitToGuia).toHaveBeenCalledWith(
        "user-1",
        "notif:turno:claimed",
        expect.objectContaining({ route: "/turnos/7" }),
      )
    })
  })

  describe("notifySupervisorCheckInPending — destinatarios supervisores", () => {
    it("encola push para SUPERVISOR y SUPER_ADMIN activos", async () => {
      const prisma = makePrismaMock()
      const socket = makeSocketMock()
      prisma.usuario.findMany.mockResolvedValue([
        { id: "sup-1" },
        { id: "admin-1" },
      ])
      prisma.notificationDelivery.createMany.mockResolvedValue({ count: 2 })

      const helpers = await loadHelpers(prisma, socket)
      await helpers.notifySupervisorCheckInPending({
        turnoId: 9,
        atencionId: 11,
        recaladaId: 4,
        guiaName: "Ana Pérez",
      })

      const args = prisma.notificationDelivery.createMany.mock.calls[0][0]
      expect(args.data.map((d: any) => d.userId).sort()).toEqual(["admin-1", "sup-1"])
      expect(args.data[0].notificationId).toBe("turno:9:checkin-pending")
      expect(socket.emitToSupervisors).toHaveBeenCalledWith(
        "notif:supervisor:checkInPending",
        expect.objectContaining({
          type: "SUPERVISOR_CHECKIN_PENDING",
          turnoId: 9,
        }),
      )
    })
  })

  describe("notifyRecaladaOverdue / notifyAtencionNearWithFreeTurnos — deduplicación", () => {
    it("usa notificationId estable por recalada para idempotencia", async () => {
      const prisma = makePrismaMock()
      const socket = makeSocketMock()
      prisma.usuario.findMany.mockResolvedValue([{ id: "sup-1" }])
      prisma.notificationDelivery.createMany.mockResolvedValue({ count: 1 })

      const helpers = await loadHelpers(prisma, socket)
      await helpers.notifyRecaladaOverdue({
        recaladaId: 42,
        codigoRecalada: "REC-042",
        fechaSalida: new Date("2026-05-26T12:00:00Z"),
      })

      const args = prisma.notificationDelivery.createMany.mock.calls[0][0]
      expect(args.skipDuplicates).toBe(true)
      expect(args.data[0].notificationId).toBe("recalada:42:overdue")
    })

    it("usa notificationId estable por atencion para idempotencia", async () => {
      const prisma = makePrismaMock()
      const socket = makeSocketMock()
      prisma.usuario.findMany.mockResolvedValue([{ id: "sup-1" }])
      prisma.notificationDelivery.createMany.mockResolvedValue({ count: 1 })

      const helpers = await loadHelpers(prisma, socket)
      await helpers.notifyAtencionNearWithFreeTurnos({
        atencionId: 81,
        recaladaId: 9,
        codigoRecalada: "REC-009",
        fechaInicio: new Date("2026-05-27T20:00:00Z"),
        turnosLibres: 3,
      })

      const args = prisma.notificationDelivery.createMany.mock.calls[0][0]
      expect(args.skipDuplicates).toBe(true)
      expect(args.data[0].notificationId).toBe("atencion:81:near-free-turnos")
    })

    it("aplica cooldown de socket: re-emisiones consecutivas no repiten socket pero sí encolan push", async () => {
      const prisma = makePrismaMock()
      const socket = makeSocketMock()
      prisma.usuario.findMany.mockResolvedValue([{ id: "sup-1" }])
      prisma.notificationDelivery.createMany.mockResolvedValue({ count: 1 })

      const helpers = await loadHelpers(prisma, socket)
      const params = {
        recaladaId: 42,
        codigoRecalada: "REC-042",
        fechaSalida: new Date("2026-05-26T12:00:00Z"),
      }

      await helpers.notifyRecaladaOverdue(params)
      await helpers.notifyRecaladaOverdue(params)

      // El socket sólo se emite la primera vez (cooldown por notificationId)...
      expect(socket.emitToSupervisors).toHaveBeenCalledTimes(1)
      // ...pero el push se intenta en ambas (dedup lo resuelve la DB).
      expect(prisma.notificationDelivery.createMany).toHaveBeenCalledTimes(2)
    })
  })

  describe("notifyGuidePenalized — push al guía con metadatos", () => {
    it("incluye penaltyId y expiresAt en payload", async () => {
      const prisma = makePrismaMock()
      const socket = makeSocketMock()
      prisma.notificationDelivery.createMany.mockResolvedValue({ count: 1 })

      const helpers = await loadHelpers(prisma, socket)
      const expiresAt = new Date("2026-05-30T00:00:00Z")
      await helpers.notifyGuidePenalized({
        guiaId: "g-1",
        guiaUserId: "u-1",
        penaltyId: "pen-1",
        turnoId: 1,
        atencionId: 2,
        expiresAt,
        reason: "NO_SHOW",
      })

      const args = prisma.notificationDelivery.createMany.mock.calls[0][0]
      expect(args.data[0].notificationId).toBe("penalty:pen-1")
      expect((args.data[0].payload as any).expiresAt).toBe(expiresAt.toISOString())
      expect((args.data[0].payload as any).penaltyId).toBe("pen-1")
    })
  })
})

export {}
