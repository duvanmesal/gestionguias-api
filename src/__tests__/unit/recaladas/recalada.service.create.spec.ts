import { prisma } from "../../../prisma/client"
import { RecaladaService } from "../../../modules/recaladas/recalada.service"
import { NotFoundError, BadRequestError } from "../../../libs/errors"

jest.mock("../../../libs/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}))

jest.mock("../../../prisma/client", () => ({
  prisma: {
    buque: { findUnique: jest.fn() },
    pais: { findUnique: jest.fn() },
    supervisor: { findUnique: jest.fn(), create: jest.fn() },
    $transaction: jest.fn(),
  },
}))

describe("[RecaladaService] create", () => {
  afterEach(() => jest.clearAllMocks())

  test("lanza BadRequestError si fechaSalida < fechaLlegada", async () => {
    await expect(
      RecaladaService.create(
        {
          buqueId: 1,
          paisOrigenId: 1,
          fechaLlegada: new Date("2026-02-02T10:00:00.000Z"),
          fechaSalida: new Date("2026-02-01T10:00:00.000Z"),
        },
        "u-1",
      ),
    ).rejects.toThrow(BadRequestError)
  })

  test("lanza NotFoundError si buqueId no existe", async () => {
    ;(prisma.buque.findUnique as jest.Mock).mockResolvedValueOnce(null)
    ;(prisma.pais.findUnique as jest.Mock).mockResolvedValueOnce({ id: 1 })

    await expect(
      RecaladaService.create(
        {
          buqueId: 999,
          paisOrigenId: 1,
          fechaLlegada: new Date("2026-02-01T10:00:00.000Z"),
        },
        "u-1",
      ),
    ).rejects.toThrow(NotFoundError)
  })

  test("lanza NotFoundError si paisOrigenId no existe", async () => {
    ;(prisma.buque.findUnique as jest.Mock).mockResolvedValueOnce({ id: 1 })
    ;(prisma.pais.findUnique as jest.Mock).mockResolvedValueOnce(null)

    await expect(
      RecaladaService.create(
        {
          buqueId: 1,
          paisOrigenId: 999,
          fechaLlegada: new Date("2026-02-01T10:00:00.000Z"),
        },
        "u-1",
      ),
    ).rejects.toThrow(NotFoundError)
  })

  test("crea supervisor si no existe, crea recalada y actualiza codigoRecalada final", async () => {
    ;(prisma.buque.findUnique as jest.Mock).mockResolvedValueOnce({ id: 10 })
    ;(prisma.pais.findUnique as jest.Mock).mockResolvedValueOnce({ id: 3 })

    ;(prisma.supervisor.findUnique as jest.Mock).mockResolvedValueOnce(null)
    ;(prisma.supervisor.create as jest.Mock).mockResolvedValueOnce({ id: 77 })

    const tx = {
      recalada: {
        create: jest.fn().mockResolvedValueOnce({
          id: 15,
          fechaLlegada: new Date("2026-02-01T10:00:00.000Z"),
        }),
        update: jest.fn().mockResolvedValueOnce({
          id: 15,
          codigoRecalada: "RA-2026-000015",
          operationalStatus: "SCHEDULED",
          status: "ACTIVO",
          fechaLlegada: new Date("2026-02-01T10:00:00.000Z"),
          fechaSalida: null,
          terminal: null,
          muelle: null,
          pasajerosEstimados: null,
          tripulacionEstimada: null,
          observaciones: null,
          fuente: "MANUAL",
          createdAt: new Date(),
          updatedAt: new Date(),
          buque: { id: 10, nombre: "Buque X" },
          paisOrigen: { id: 3, codigo: "CO", nombre: "Colombia" },
          supervisor: { id: 77, usuario: { id: "u-1", email: "a@a.com", nombres: null, apellidos: null } },
        }),
      },
    }

    ;(prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => cb(tx))

    const out = await RecaladaService.create(
      {
        buqueId: 10,
        paisOrigenId: 3,
        fechaLlegada: new Date("2026-02-01T10:00:00.000Z"),
        fuente: "MANUAL" as any,
      },
      "u-1",
    )

    // Supervisor se crea si no existe
    expect(prisma.supervisor.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { usuarioId: "u-1" },
        select: { id: true },
      }),
    )

    // Dentro de tx: crea con codigo temporal y luego actualiza con codigo final
    expect(tx.recalada.create).toHaveBeenCalled()
    expect(tx.recalada.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 15 },
        data: { codigoRecalada: "RA-2026-000015" },
      }),
    )

    // Retorna el objeto final
    expect(out.codigoRecalada).toBe("RA-2026-000015")
    expect(out.operationalStatus).toBe("SCHEDULED")
  })
})
