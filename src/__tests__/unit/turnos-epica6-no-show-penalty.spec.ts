import type { Request } from "express"

import { BadRequestError, ConflictError } from "../../libs/errors"
import { logsService } from "../../libs/logs/logs.service"
import { turnoRepository } from "../../modules/turnos/_data/turno.repository"
import { noShowTurnoUsecase } from "../../modules/turnos/_usecases/noShow.usecase"
import { penaltyRepository } from "../../modules/penalties/penalty.repository"
import { penaltyService } from "../../modules/penalties/penalty.service"
import { operationalConfigService } from "../../modules/operational-config/operational-config.service"

const req = { headers: {}, method: "PATCH", originalUrl: "/test" } as Request

function gate(overrides: Partial<any> = {}) {
  return {
    id: 1,
    atencionId: 10,
    guiaId: "guia-1",
    numero: 1,
    status: "ASSIGNED",
    fechaInicio: new Date("2026-05-04T14:00:00.000Z"),
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

describe("Epica 6 — NO_SHOW y penalizaciones con vigencia", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date("2026-05-04T15:30:00.000Z"))
    jest.spyOn(logsService, "audit").mockImplementation(() => undefined)
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  describe("noShowTurnoUsecase exige motivo", () => {
    it("falla si reason está vacío", async () => {
      await expect(noShowTurnoUsecase(req, 1, undefined, "sup-1")).rejects.toBeInstanceOf(
        BadRequestError,
      )
      await expect(noShowTurnoUsecase(req, 1, "  ", "sup-1")).rejects.toBeInstanceOf(
        BadRequestError,
      )
    })

    it("falla si reason es muy corto (<3)", async () => {
      await expect(noShowTurnoUsecase(req, 1, "no", "sup-1")).rejects.toBeInstanceOf(
        BadRequestError,
      )
    })
  })

  describe("noShowTurnoUsecase crea penalización con vigencia", () => {
    it("crea GuiaPenalty con expiresAt = now + duration y NO_SHOW como motivo", async () => {
      const findGate = jest
        .spyOn(turnoRepository, "findGateForOperacion")
        .mockResolvedValue(gate() as any)
      jest.spyOn(operationalConfigService, "getNoShowPenaltyDurationHours").mockResolvedValue(48)
      jest.spyOn(operationalConfigService, "getTurnoAssignmentMode").mockResolvedValue("MANUAL_RECLAMO" as any)
      jest
        .spyOn(turnoRepository, "noShowIfStillAssigned")
        .mockResolvedValue({ count: 1 } as any)
      jest.spyOn(turnoRepository, "findById").mockResolvedValue({
        id: 1,
        atencionId: 10,
        status: "NO_SHOW",
        atencion: { recaladaId: 20, recalada: { codigoRecalada: "RA-2026-000020" } },
      } as any)
      jest.spyOn(turnoRepository, "findGuiaById").mockResolvedValue({
        usuario: { id: "user-1" },
      } as any)
      jest
        .spyOn(turnoRepository, "transaction")
        .mockImplementation(async (fn: any) => fn({} as any))

      const applyPenalty = jest
        .spyOn(penaltyService, "applyNoShowPenalty")
        .mockResolvedValue({
          id: "p1",
          guiaId: "guia-1",
          turnoId: 1,
          reason: "El guía no se presentó",
          motivo: "NO_SHOW",
          startsAt: new Date(),
          expiresAt: new Date(Date.now() + 48 * 3600 * 1000),
          createdById: "sup-1",
        })
      jest.spyOn(penaltyService, "findActiveForGuia").mockResolvedValue({
        id: "p1",
        guiaId: "guia-1",
        turnoId: 1,
        reason: "El guía no se presentó",
        motivo: "NO_SHOW",
        startsAt: new Date(),
        expiresAt: new Date(Date.now() + 48 * 3600 * 1000),
        createdById: "sup-1",
      } as any)
      jest.spyOn(penaltyService, "notifyPenalized").mockImplementation(() => undefined)

      const updated = await noShowTurnoUsecase(
        req,
        1,
        "El guía no se presentó en el muelle",
        "sup-1",
      )

      expect(findGate).toHaveBeenCalled()
      expect(applyPenalty).toHaveBeenCalledTimes(1)
      expect(applyPenalty.mock.calls[0][1].reason).toBe("El guía no se presentó en el muelle")
      expect(applyPenalty.mock.calls[0][1].guiaId).toBe("guia-1")
      expect(updated.status).toBe("NO_SHOW")
    })
  })

  describe("isCurrentlyPenalized — lazy sync", () => {
    it("devuelve penalized=false sin tocar BD si pendingPenalty=false", async () => {
      const find = jest.spyOn(penaltyRepository, "findActiveForGuia")
      const result = await penaltyService.isCurrentlyPenalized({
        guiaId: "g-x",
        pendingPenalty: false,
      })
      expect(result.penalized).toBe(false)
      expect(find).not.toHaveBeenCalled()
    })

    it("devuelve penalized=true con activePenalty si pendingPenalty=true y hay vigente", async () => {
      const expires = new Date("2026-05-05T15:30:00.000Z")
      jest.spyOn(penaltyRepository, "findActiveForGuia").mockResolvedValue({
        id: "p1",
        guiaId: "g-x",
        turnoId: 1,
        reason: "x",
        motivo: "NO_SHOW",
        startsAt: new Date(),
        expiresAt: expires,
        createdById: "sup-1",
      } as any)

      const result = await penaltyService.isCurrentlyPenalized({
        guiaId: "g-x",
        pendingPenalty: true,
      })
      expect(result.penalized).toBe(true)
      expect(result.activePenalty?.expiresAt).toEqual(expires)
    })

    it("limpia pendingPenalty si ya no hay penalty vigente (lazy sync)", async () => {
      jest.spyOn(penaltyRepository, "findActiveForGuia").mockResolvedValue(null)
      const clear = jest
        .spyOn(penaltyRepository, "clearPendingFlag")
        .mockResolvedValue({} as any)

      const result = await penaltyService.isCurrentlyPenalized({
        guiaId: "g-x",
        pendingPenalty: true,
      })
      expect(result.penalized).toBe(false)
      expect(clear).toHaveBeenCalledWith("g-x", undefined)
    })
  })

  describe("applyNoShowPenalty usa la duración configurada", () => {
    it("calcula expiresAt = now + durationHours*3600*1000", async () => {
      jest.spyOn(operationalConfigService, "getNoShowPenaltyDurationHours").mockResolvedValue(24)
      const create = jest
        .spyOn(penaltyRepository, "createWithSync")
        .mockImplementation(async (args: any) => ({
          id: "p1",
          ...args,
        }))

      const result = await penaltyService.applyNoShowPenalty(undefined, {
        guiaId: "g-1",
        turnoId: 1,
        reason: "El guía no se presentó",
        atencionId: 10,
        actorUserId: "sup-1",
      })

      expect(create).toHaveBeenCalledTimes(1)
      const callArgs = create.mock.calls[0][0]
      expect(callArgs.guiaId).toBe("g-1")
      expect(callArgs.motivo).toBe("NO_SHOW")
      const diffMs = callArgs.expiresAt.getTime() - callArgs.startsAt.getTime()
      expect(diffMs).toBe(24 * 60 * 60 * 1000)
      expect(result.guiaId).toBe("g-1")
    })

    it("acepta actorUserId null (path automático)", async () => {
      jest.spyOn(operationalConfigService, "getNoShowPenaltyDurationHours").mockResolvedValue(48)
      jest
        .spyOn(penaltyRepository, "createWithSync")
        .mockImplementation(async (args: any) => ({ id: "p1", ...args }))

      const result = await penaltyService.applyNoShowPenalty(undefined, {
        guiaId: "g-1",
        turnoId: 1,
        reason: "auto",
        actorUserId: null,
      })

      expect(result.createdById).toBeNull()
    })
  })
})
