import type { Request } from "express"

import { BadRequestError } from "../../libs/errors"
import {
  assertWindowDatesValid,
  assertWindowWithinRecalada,
} from "../../modules/atenciones/_domain/atencion.rules"
import {
  atencionCapacityCache,
  toCachedAtencionCapacity,
} from "../../modules/atenciones/_shared/atencion-capacity.cache"

const req = { headers: {}, method: "PATCH", originalUrl: "/test" } as Request

describe("atenciones epica 2 rules", () => {
  afterEach(() => {
    atencionCapacityCache.clear()
    jest.restoreAllMocks()
  })

  it("validates atencion windows inside the recalada range", () => {
    const recalada = {
      fechaLlegada: new Date("2026-05-15T12:00:00.000Z"),
      fechaSalida: new Date("2026-05-15T20:00:00.000Z"),
    }

    expect(() =>
      assertWindowWithinRecalada({
        fechaInicio: new Date("2026-05-15T12:00:00.000Z"),
        fechaFin: new Date("2026-05-15T16:00:00.000Z"),
        recalada,
      }),
    ).not.toThrow()

    expect(() =>
      assertWindowWithinRecalada({
        fechaInicio: new Date("2026-05-15T11:59:59.000Z"),
        fechaFin: new Date("2026-05-15T16:00:00.000Z"),
        recalada,
      }),
    ).toThrow(BadRequestError)

    expect(() =>
      assertWindowWithinRecalada({
        fechaInicio: new Date("2026-05-15T18:00:00.000Z"),
        fechaFin: new Date("2026-05-15T20:00:01.000Z"),
        recalada,
      }),
    ).toThrow(BadRequestError)
  })

  it("rejects fechaFin before fechaInicio", () => {
    expect(() =>
      assertWindowDatesValid(
        new Date("2026-05-15T16:00:00.000Z"),
        new Date("2026-05-15T15:59:59.000Z"),
      ),
    ).toThrow(BadRequestError)
  })

  it("stores and invalidates atencion capacity in memory", () => {
    atencionCapacityCache.set(
      toCachedAtencionCapacity({
        id: 20,
        recaladaId: 10,
        turnosTotal: 12,
        status: "ACTIVO",
        operationalStatus: "OPEN",
        fechaFin: new Date("2026-05-15T20:00:00.000Z"),
      }),
    )

    expect(atencionCapacityCache.get(20)?.turnosTotal).toBe(12)
    expect(atencionCapacityCache.size()).toBe(1)

    atencionCapacityCache.invalidate(20)

    expect(atencionCapacityCache.get(20)).toBeNull()
    expect(atencionCapacityCache.size()).toBe(0)
  })

  it("does not cache closed or canceled atenciones", () => {
    atencionCapacityCache.set(
      toCachedAtencionCapacity({
        id: 20,
        recaladaId: 10,
        turnosTotal: 12,
        status: "ACTIVO",
        operationalStatus: "CLOSED",
        fechaFin: new Date("2026-05-15T20:00:00.000Z"),
      }),
    )

    expect(atencionCapacityCache.get(20)).toBeNull()
  })
})

describe("atenciones epica 2 repository contracts", () => {
  afterEach(() => {
    jest.resetModules()
    jest.dontMock("../../prisma/client")
  })

  it("uses half-open intervals to find active overlaps", async () => {
    const findFirst = jest.fn().mockResolvedValue(null)
    jest.doMock("../../prisma/client", () => ({
      prisma: {
        atencion: { findFirst },
      },
    }))

    const { atencionRepository } = require("../../modules/atenciones/_data/atencion.repository") as typeof import("../../modules/atenciones/_data/atencion.repository")

    const fechaInicio = new Date("2026-05-15T16:00:00.000Z")
    const fechaFin = new Date("2026-05-15T20:00:00.000Z")

    await atencionRepository.findOverlapActive({
      recaladaId: 10,
      fechaInicio,
      fechaFin,
    })

    expect(findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        recaladaId: 10,
        status: "ACTIVO",
        operationalStatus: { not: "CANCELED" },
        AND: [{ fechaInicio: { lt: fechaFin } }, { fechaFin: { gt: fechaInicio } }],
      }),
      select: { id: true, fechaInicio: true, fechaFin: true },
    })
  })
})

describe("atenciones epica 2 usecases", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date("2026-05-15T10:00:00.000Z"))
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
    atencionCapacityCache.clear()
  })

  it("updates the capacity cache after changing turnosTotal", async () => {
    const { logsService } = require("../../libs/logs/logs.service") as typeof import("../../libs/logs/logs.service")
    const { atencionRepository } = require("../../modules/atenciones/_data/atencion.repository") as typeof import("../../modules/atenciones/_data/atencion.repository")
    const { operationalConfigService } = require("../../modules/operational-config/operational-config.service") as typeof import("../../modules/operational-config/operational-config.service")
    const { updateAtencionUsecase } = require("../../modules/atenciones/_usecases/update.usecase") as typeof import("../../modules/atenciones/_usecases/update.usecase")
    const { atencionCapacityCache: usecaseCapacityCache } = require("../../modules/atenciones/_shared/atencion-capacity.cache") as typeof import("../../modules/atenciones/_shared/atencion-capacity.cache")

    jest.spyOn(logsService, "audit").mockImplementation(() => undefined)
    jest.spyOn(operationalConfigService, "getTurnoAssignmentMode").mockResolvedValue("MANUAL_RECLAMO" as any)
    jest.spyOn(atencionRepository, "findByIdForUpdate").mockResolvedValue({
      id: 20,
      recaladaId: 10,
      turnosTotal: 6,
      fechaInicio: new Date("2026-05-15T12:00:00.000Z"),
      fechaFin: new Date("2026-05-15T16:00:00.000Z"),
      status: "ACTIVO",
      operationalStatus: "OPEN",
    } as any)
    jest.spyOn(atencionRepository, "updateWithTurnosAtomic").mockResolvedValue({
      id: 20,
      recaladaId: 10,
      turnosTotal: 8,
      fechaInicio: new Date("2026-05-15T12:00:00.000Z"),
      fechaFin: new Date("2026-05-15T16:00:00.000Z"),
      status: "ACTIVO",
      operationalStatus: "OPEN",
    } as any)

    await updateAtencionUsecase(req, 20, { turnosTotal: 8 }, "actor-1")

    expect(usecaseCapacityCache.get(20)?.turnosTotal).toBe(8)
  })

  it("blocks reducing capacity when assigned turnos would be removed", async () => {
    const { logsService } = require("../../libs/logs/logs.service") as typeof import("../../libs/logs/logs.service")
    const { atencionRepository } = require("../../modules/atenciones/_data/atencion.repository") as typeof import("../../modules/atenciones/_data/atencion.repository")
    const { updateAtencionUsecase } = require("../../modules/atenciones/_usecases/update.usecase") as typeof import("../../modules/atenciones/_usecases/update.usecase")

    jest.spyOn(logsService, "audit").mockImplementation(() => undefined)
    jest.spyOn(atencionRepository, "findByIdForUpdate").mockResolvedValue({
      id: 20,
      recaladaId: 10,
      turnosTotal: 6,
      fechaInicio: new Date("2026-05-15T12:00:00.000Z"),
      fechaFin: new Date("2026-05-15T16:00:00.000Z"),
      status: "ACTIVO",
      operationalStatus: "OPEN",
    } as any)
    jest.spyOn(atencionRepository, "updateWithTurnosAtomic").mockRejectedValue(
      Object.assign(new Error("ATENCION_REDUCE_ASSIGNED_TURNOS"), {
        code: "ATENCION_REDUCE_ASSIGNED_TURNOS",
        detail: { newTotal: 3 },
      }),
    )

    await expect(
      updateAtencionUsecase(req, 20, { turnosTotal: 3 }, "actor-1"),
    ).rejects.toThrow("No se puede reducir el cupo")
  })
})
