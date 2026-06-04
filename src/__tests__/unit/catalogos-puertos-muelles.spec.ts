import type { Request } from "express"

import { ConflictError, NotFoundError } from "../../libs/errors"
import { PuertoService } from "../../modules/puertos/puerto.service"
import { puertoRepository } from "../../modules/puertos/_data/puerto.repository"
import { MuelleService } from "../../modules/muelles/muelle.service"
import { muelleRepository } from "../../modules/muelles/_data/muelle.repository"

const req = { headers: {}, method: "PATCH", originalUrl: "/test" } as Request

describe("catalogos puertos y muelles", () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it("requires an existing pais before creating a puerto", async () => {
    jest.spyOn(puertoRepository, "paisExists").mockResolvedValue(null)
    const create = jest.spyOn(puertoRepository, "create").mockResolvedValue({} as any)

    await expect(
      PuertoService.create(req, {
        codigo: "CTG",
        nombre: "Puerto de Cartagena",
        ciudad: "Cartagena",
        paisId: 1,
        status: "ACTIVO",
      }),
    ).rejects.toBeInstanceOf(NotFoundError)

    expect(create).not.toHaveBeenCalled()
  })

  it("blocks deleting a puerto with muelles or recaladas", async () => {
    jest.spyOn(puertoRepository, "getById").mockResolvedValue({ id: 10 } as any)
    jest.spyOn(puertoRepository, "countMuelles").mockResolvedValue(1)
    jest.spyOn(puertoRepository, "countRecaladas").mockResolvedValue(0)
    const remove = jest.spyOn(puertoRepository, "delete").mockResolvedValue({} as any)

    await expect(PuertoService.remove(req, 10)).rejects.toBeInstanceOf(ConflictError)
    expect(remove).not.toHaveBeenCalled()
  })

  it("requires an existing puerto before creating a muelle", async () => {
    jest.spyOn(muelleRepository, "puertoExists").mockResolvedValue(null)
    const create = jest.spyOn(muelleRepository, "create").mockResolvedValue({} as any)

    await expect(
      MuelleService.create(req, {
        codigo: "M-1",
        nombre: "Muelle principal",
        puertoId: 10,
        capacidadCruceros: 2,
        status: "ACTIVO",
      }),
    ).rejects.toBeInstanceOf(NotFoundError)

    expect(create).not.toHaveBeenCalled()
  })

  it("blocks deleting a muelle with recaladas", async () => {
    jest.spyOn(muelleRepository, "getById").mockResolvedValue({ id: 20 } as any)
    jest.spyOn(muelleRepository, "countRecaladas").mockResolvedValue(1)
    const remove = jest.spyOn(muelleRepository, "delete").mockResolvedValue({} as any)

    await expect(MuelleService.remove(req, 20)).rejects.toBeInstanceOf(ConflictError)
    expect(remove).not.toHaveBeenCalled()
  })
})
