import type { Request } from "express"

import { ConflictError, NotFoundError } from "../../libs/errors"
import { logsService } from "../../libs/logs/logs.service"
import { atencionRepository } from "../../modules/atenciones/_data/atencion.repository"
import { upsertAtencionEvaluationUsecase } from "../../modules/atenciones/_usecases/evaluation.usecase"

const req = { headers: {}, method: "PATCH", originalUrl: "/test" } as Request

describe("atenciones evaluation", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date("2026-06-04T12:00:00.000Z"))
    jest.spyOn(logsService, "audit").mockImplementation(() => undefined)
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it("returns not found when the atencion does not exist", async () => {
    jest.spyOn(atencionRepository, "findGateForClose").mockResolvedValue(null)
    const upsert = jest.spyOn(atencionRepository, "upsertEvaluation").mockResolvedValue({} as any)

    await expect(
      upsertAtencionEvaluationUsecase(
        req,
        10,
        {
          calificacion: 5,
          estadoFinal: "SATISFACTORIA",
          observaciones: undefined,
        },
        "actor-1",
      ),
    ).rejects.toBeInstanceOf(NotFoundError)

    expect(upsert).not.toHaveBeenCalled()
  })

  it("blocks evaluating canceled atenciones", async () => {
    jest.spyOn(atencionRepository, "findGateForClose").mockResolvedValue({
      id: 10,
      recaladaId: 5,
      operationalStatus: "CANCELED",
    } as any)
    const upsert = jest.spyOn(atencionRepository, "upsertEvaluation").mockResolvedValue({} as any)

    await expect(
      upsertAtencionEvaluationUsecase(
        req,
        10,
        {
          calificacion: 3,
          estadoFinal: "CON_NOVEDADES",
          observaciones: "Cancelada",
        },
        "actor-1",
      ),
    ).rejects.toBeInstanceOf(ConflictError)

    expect(upsert).not.toHaveBeenCalled()
  })

  it("upserts the evaluation and returns the updated atencion", async () => {
    jest.spyOn(atencionRepository, "findGateForClose").mockResolvedValue({
      id: 10,
      recaladaId: 5,
      operationalStatus: "CLOSED",
    } as any)
    const upsert = jest.spyOn(atencionRepository, "upsertEvaluation").mockResolvedValue({} as any)
    jest.spyOn(atencionRepository, "findById").mockResolvedValue({
      id: 10,
      recaladaId: 5,
      operationalStatus: "CLOSED",
    } as any)

    const result = await upsertAtencionEvaluationUsecase(
      req,
      10,
      {
        calificacion: 4,
        estadoFinal: "CON_NOVEDADES",
        observaciones: "Novedad menor",
      },
      "actor-1",
    )

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        atencionId: 10,
        calificacion: 4,
        estadoFinal: "CON_NOVEDADES",
        observaciones: "Novedad menor",
        evaluatedById: "actor-1",
        evaluatedAt: new Date("2026-06-04T12:00:00.000Z"),
      }),
    )
    expect(result?.id).toBe(10)
  })
})
