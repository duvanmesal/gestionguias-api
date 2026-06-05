import type { Request } from "express"

jest.mock("../../modules/notifications/operational-notifications", () => ({
  notifyAtencionAvailableToGuides: jest.fn(() => Promise.resolve()),
  notifyTurnoClaimedToGuide: jest.fn(() => Promise.resolve()),
  notifyTurnoAssignedToGuide: jest.fn(() => Promise.resolve()),
  notifyTurnoCanceledToGuide: jest.fn(() => Promise.resolve()),
  notifyTurnoChangedToGuide: jest.fn(() => Promise.resolve()),
  notifyCheckInReminder: jest.fn(() => Promise.resolve()),
  notifyGuidePenalized: jest.fn(() => Promise.resolve()),
  notifySupervisorCheckInPending: jest.fn(() => Promise.resolve()),
  notifyRecaladaOverdue: jest.fn(() => Promise.resolve()),
  notifyAtencionNearWithFreeTurnos: jest.fn(() => Promise.resolve()),
}))

import { BadRequestError, ConflictError } from "../../libs/errors"
import { logsService } from "../../libs/logs/logs.service"
import { turnoRepository } from "../../modules/turnos/_data/turno.repository"
import { checkInTurnoUsecase } from "../../modules/turnos/_usecases/checkIn.usecase"
import { confirmCheckInUsecase } from "../../modules/turnos/_usecases/confirmCheckIn.usecase"
import { rejectCheckInUsecase } from "../../modules/turnos/_usecases/rejectCheckIn.usecase"
import { checkOutTurnoUsecase } from "../../modules/turnos/_usecases/checkOut.usecase"

const req = { headers: {}, method: "PATCH", originalUrl: "/test" } as Request

function gate(overrides: Partial<any> = {}) {
  return {
    id: 1,
    atencionId: 10,
    guiaId: "guia-1",
    numero: 1,
    status: "ASSIGNED",
    fechaInicio: new Date("2026-05-04T15:00:00.000Z"),
    fechaFin: new Date("2026-05-04T16:00:00.000Z"),
    checkInAt: null,
    checkOutAt: null,
    checkInRequestedAt: null,
    checkInConfirmedAt: null,
    checkInRejectedAt: null,
    checkInRejectReason: null,
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
    ...overrides,
  }
}

describe("Epica 5 — Doble check-in", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date("2026-05-04T14:45:00.000Z"))
    jest.spyOn(logsService, "audit").mockImplementation(() => undefined)
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  describe("checkInTurnoUsecase (solicitud del guía)", () => {
    it("registra checkInRequestedAt y mantiene status ASSIGNED", async () => {
      jest.spyOn(turnoRepository, "getActorGuiaIdOrThrow").mockResolvedValue("guia-1")
      jest.spyOn(turnoRepository, "findGateForOperacion").mockResolvedValue(gate() as any)

      const requestFn = jest
        .spyOn(turnoRepository, "requestCheckInIfStillAssigned")
        .mockResolvedValue({ count: 1 } as any)
      jest.spyOn(turnoRepository, "findById").mockResolvedValue({
        id: 1,
        atencionId: 10,
        status: "ASSIGNED",
        checkInRequestedAt: new Date(),
      } as any)
      jest
        .spyOn(turnoRepository, "transaction")
        .mockImplementation(async (fn: any) => fn({} as any))

      const updated = await checkInTurnoUsecase(req, 1, "actor-user-1")

      expect(requestFn).toHaveBeenCalledTimes(1)
      expect(updated.status).toBe("ASSIGNED")
      expect(updated.checkInRequestedAt).toBeTruthy()
    })

    it("bloquea cuando otro guía intenta solicitar", async () => {
      jest.spyOn(turnoRepository, "getActorGuiaIdOrThrow").mockResolvedValue("otro-guia")
      jest.spyOn(turnoRepository, "findGateForOperacion").mockResolvedValue(gate() as any)

      await expect(checkInTurnoUsecase(req, 1, "actor-1")).rejects.toBeInstanceOf(ConflictError)
    })

    it("bloquea cuando ya existe solicitud pendiente", async () => {
      jest.spyOn(turnoRepository, "getActorGuiaIdOrThrow").mockResolvedValue("guia-1")
      jest.spyOn(turnoRepository, "findGateForOperacion").mockResolvedValue(
        gate({ checkInRequestedAt: new Date() }) as any,
      )

      await expect(checkInTurnoUsecase(req, 1, "actor-1")).rejects.toBeInstanceOf(ConflictError)
    })

    it("bloquea reintento si la solicitud previa fue rechazada", async () => {
      jest.spyOn(turnoRepository, "getActorGuiaIdOrThrow").mockResolvedValue("guia-1")
      jest.spyOn(turnoRepository, "findGateForOperacion").mockResolvedValue(
        gate({
          checkInRequestedAt: new Date(),
          checkInRejectedAt: new Date(),
          checkInRejectReason: "No se presentó",
        }) as any,
      )

      await expect(checkInTurnoUsecase(req, 1, "actor-1")).rejects.toBeInstanceOf(ConflictError)
    })
  })

  describe("confirmCheckInUsecase (supervisor)", () => {
    it("requiere una solicitud previa", async () => {
      jest.spyOn(turnoRepository, "findGateForOperacion").mockResolvedValue(gate() as any)

      await expect(confirmCheckInUsecase(req, 1, "sup-1")).rejects.toBeInstanceOf(ConflictError)
    })

    it("pasa el turno a IN_PROGRESS al confirmar una solicitud pendiente", async () => {
      jest.spyOn(turnoRepository, "findGateForOperacion").mockResolvedValue(
        gate({ checkInRequestedAt: new Date("2026-05-04T14:40:00.000Z") }) as any,
      )
      const confirmFn = jest
        .spyOn(turnoRepository, "confirmCheckInIfStillPending")
        .mockResolvedValue({ count: 1 } as any)
      jest.spyOn(turnoRepository, "findById").mockResolvedValue({
        id: 1,
        atencionId: 10,
        status: "IN_PROGRESS",
        checkInAt: new Date(),
        checkInConfirmedAt: new Date(),
      } as any)
      jest
        .spyOn(turnoRepository, "transaction")
        .mockImplementation(async (fn: any) => fn({} as any))

      const updated = await confirmCheckInUsecase(req, 1, "sup-1")

      expect(confirmFn).toHaveBeenCalledTimes(1)
      expect(updated.status).toBe("IN_PROGRESS")
    })
  })

  describe("rejectCheckInUsecase (supervisor)", () => {
    it("falla cuando no se entrega motivo", async () => {
      await expect(rejectCheckInUsecase(req, 1, "   ", "sup-1")).rejects.toBeInstanceOf(
        BadRequestError,
      )
    })

    it("deja el turno en ASSIGNED al rechazar una solicitud pendiente", async () => {
      jest.spyOn(turnoRepository, "findGateForOperacion").mockResolvedValue(
        gate({ checkInRequestedAt: new Date("2026-05-04T14:40:00.000Z") }) as any,
      )
      const rejectFn = jest
        .spyOn(turnoRepository, "rejectCheckInIfStillPending")
        .mockResolvedValue({ count: 1 } as any)
      jest.spyOn(turnoRepository, "findById").mockResolvedValue({
        id: 1,
        atencionId: 10,
        status: "ASSIGNED",
        checkInRejectedAt: new Date(),
        checkInRejectReason: "Sin presentación física",
      } as any)
      jest
        .spyOn(turnoRepository, "transaction")
        .mockImplementation(async (fn: any) => fn({} as any))

      const updated = await rejectCheckInUsecase(
        req,
        1,
        "Sin presentación física",
        "sup-1",
      )

      expect(rejectFn).toHaveBeenCalledTimes(1)
      expect(updated.status).toBe("ASSIGNED")
      expect(updated.checkInRejectReason).toBe("Sin presentación física")
    })
  })

  describe("checkOutTurnoUsecase con check-in pendiente", () => {
    it("rechaza check-out si el turno sigue en ASSIGNED (check-in pendiente)", async () => {
      jest.spyOn(turnoRepository, "getActorGuiaIdOrThrow").mockResolvedValue("guia-1")
      jest.spyOn(turnoRepository, "findGateForOperacion").mockResolvedValue(
        gate({ checkInRequestedAt: new Date("2026-05-04T14:40:00.000Z") }) as any,
      )

      await expect(checkOutTurnoUsecase(req, 1, "actor-1")).rejects.toBeInstanceOf(ConflictError)
    })
  })
})
