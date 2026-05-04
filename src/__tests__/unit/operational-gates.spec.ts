import type { Request } from "express"

import { ConflictError, BadRequestError } from "../../libs/errors"
import { logsService } from "../../libs/logs/logs.service"
import { atencionRepository } from "../../modules/atenciones/_data/atencion.repository"
import { updateAtencionUsecase } from "../../modules/atenciones/_usecases/update.usecase"
import { recaladaRepository } from "../../modules/recaladas/_data/recalada.repository"
import { arriveRecaladaUsecase } from "../../modules/recaladas/_usecases/arrive.usecase"
import { departRecaladaUsecase } from "../../modules/recaladas/_usecases/depart.usecase"
import { updateRecaladaUsecase } from "../../modules/recaladas/_usecases/update.usecase"
import { turnoRepository } from "../../modules/turnos/_data/turno.repository"
import { cancelTurnoUsecase } from "../../modules/turnos/_usecases/cancel.usecase"
import { checkOutTurnoUsecase } from "../../modules/turnos/_usecases/checkOut.usecase"

const req = { headers: {}, method: "PATCH", originalUrl: "/test" } as Request

function activeGate(status: "AVAILABLE" | "ASSIGNED" | "IN_PROGRESS" | "COMPLETED" | "CANCELED" | "NO_SHOW") {
  return {
    id: 1,
    atencionId: 10,
    guiaId: status === "AVAILABLE" ? null : "guia-1",
    numero: 1,
    status,
    fechaInicio: new Date("2026-05-04T15:00:00.000Z"),
    fechaFin: new Date("2026-05-04T16:00:00.000Z"),
    checkInAt: null,
    checkOutAt: null,
    observaciones: null,
    atencion: {
      status: "ACTIVO",
      operationalStatus: "OPEN",
      recalada: {
        id: 20,
        codigoRecalada: "RA-2026-000020",
        status: "ACTIVO",
        operationalStatus: "SCHEDULED",
      },
    },
  } as const
}

describe("operational guards", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date("2026-05-04T14:30:00.000Z"))
    jest.spyOn(logsService, "audit").mockImplementation(() => undefined)
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it("blocks canceling a turno when the recalada is already departed", async () => {
    const gate = {
      ...activeGate("ASSIGNED"),
      atencion: {
        ...activeGate("ASSIGNED").atencion,
        recalada: {
          ...activeGate("ASSIGNED").atencion.recalada,
          operationalStatus: "DEPARTED",
        },
      },
    } as const

    jest.spyOn(turnoRepository, "findGateForOperacion").mockResolvedValue(gate as any)
    const cancel = jest.spyOn(turnoRepository, "cancel").mockResolvedValue({} as any)

    await expect(cancelTurnoUsecase(req, 1, undefined, "actor-1")).rejects.toBeInstanceOf(ConflictError)
    expect(cancel).not.toHaveBeenCalled()
  })

  it("blocks canceling NO_SHOW turnos", async () => {
    jest.spyOn(turnoRepository, "findGateForOperacion").mockResolvedValue(activeGate("NO_SHOW") as any)
    const cancel = jest.spyOn(turnoRepository, "cancel").mockResolvedValue({} as any)

    await expect(cancelTurnoUsecase(req, 1, undefined, "actor-1")).rejects.toBeInstanceOf(ConflictError)
    expect(cancel).not.toHaveBeenCalled()
  })

  it("blocks check-out before the scheduled turno start", async () => {
    jest.spyOn(turnoRepository, "getActorGuiaIdOrThrow").mockResolvedValue("guia-1")
    jest.spyOn(turnoRepository, "findGateForOperacion").mockResolvedValue(activeGate("IN_PROGRESS") as any)
    const transaction = jest.spyOn(turnoRepository, "transaction")

    await expect(checkOutTurnoUsecase(req, 1, "actor-1")).rejects.toBeInstanceOf(BadRequestError)
    expect(transaction).not.toHaveBeenCalled()
  })

  it("blocks changing an atencion window while it has assigned or in-progress turnos", async () => {
    jest.spyOn(atencionRepository, "findByIdForUpdate").mockResolvedValue({
      id: 10,
      recaladaId: 20,
      turnosTotal: 2,
      fechaInicio: new Date("2026-05-04T16:00:00.000Z"),
      fechaFin: new Date("2026-05-04T18:00:00.000Z"),
      status: "ACTIVO",
      operationalStatus: "OPEN",
    } as any)
    jest.spyOn(atencionRepository, "findRecaladaByIdForAtencion").mockResolvedValue({
      id: 20,
      codigoRecalada: "RA-2026-000020",
      fechaLlegada: new Date("2026-05-04T10:00:00.000Z"),
      fechaSalida: new Date("2026-05-05T10:00:00.000Z"),
      status: "ACTIVO",
      operationalStatus: "SCHEDULED",
    } as any)
    jest.spyOn(atencionRepository, "findOverlapActive").mockResolvedValue(null)
    jest.spyOn(atencionRepository, "countTurnosAssignedOrInProgress").mockResolvedValue(1)
    const update = jest.spyOn(atencionRepository, "updateWithTurnosAtomic").mockResolvedValue({} as any)

    await expect(
      updateAtencionUsecase(
        req,
        10,
        { fechaInicio: new Date("2026-05-04T17:00:00.000Z") },
        "actor-1",
      ),
    ).rejects.toBeInstanceOf(ConflictError)
    expect(update).not.toHaveBeenCalled()
  })

  it("blocks shrinking a recalada window that would leave an atencion outside", async () => {
    jest.spyOn(recaladaRepository, "findByIdForUpdate").mockResolvedValue({
      id: 20,
      buqueId: 5,
      operationalStatus: "SCHEDULED",
      fechaLlegada: new Date("2026-05-04T10:00:00.000Z"),
      fechaSalida: new Date("2026-05-05T10:00:00.000Z"),
    } as any)
    jest.spyOn(recaladaRepository, "findOverlappingForBuque").mockResolvedValue(null)
    jest.spyOn(recaladaRepository, "findAtencionOutsideWindow").mockResolvedValue({
      id: 10,
      fechaInicio: new Date("2026-05-04T18:00:00.000Z"),
      fechaFin: new Date("2026-05-04T20:00:00.000Z"),
    } as any)
    const update = jest.spyOn(recaladaRepository, "update").mockResolvedValue({} as any)

    await expect(
      updateRecaladaUsecase(
        req,
        20,
        { fechaSalida: new Date("2026-05-04T12:00:00.000Z") } as any,
        "actor-1",
      ),
    ).rejects.toBeInstanceOf(ConflictError)
    expect(update).not.toHaveBeenCalled()
  })

  it("blocks ARRIVED with a future arrivedAt", async () => {
    jest.spyOn(recaladaRepository, "findByIdForSimpleStatus").mockResolvedValue({
      id: 20,
      operationalStatus: "SCHEDULED",
      fechaLlegada: new Date("2026-05-04T10:00:00.000Z"),
    } as any)
    const update = jest.spyOn(recaladaRepository, "update").mockResolvedValue({} as any)

    await expect(
      arriveRecaladaUsecase(req, 20, new Date("2026-05-04T15:00:00.000Z"), "actor-1"),
    ).rejects.toBeInstanceOf(BadRequestError)
    expect(update).not.toHaveBeenCalled()
  })

  it("blocks DEPARTED with a future departedAt", async () => {
    jest.spyOn(recaladaRepository, "findByIdForDepart").mockResolvedValue({
      id: 20,
      operationalStatus: "ARRIVED",
      arrivedAt: new Date("2026-05-04T10:00:00.000Z"),
      fechaSalida: new Date("2026-05-04T18:00:00.000Z"),
    } as any)
    const update = jest.spyOn(recaladaRepository, "update").mockResolvedValue({} as any)

    await expect(
      departRecaladaUsecase(req, 20, new Date("2026-05-04T15:00:00.000Z"), "actor-1"),
    ).rejects.toBeInstanceOf(BadRequestError)
    expect(update).not.toHaveBeenCalled()
  })
})
