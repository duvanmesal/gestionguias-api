import { buildAtencionesWhere } from "../../modules/atenciones/_data/atencion.filters"
import { listAtencionesQuerySchema } from "../../modules/atenciones/atencion.schemas"

describe("atenciones — filtro pendingEval", () => {
  it("schema coerce 'true' (string) a boolean true", () => {
    const parsed = listAtencionesQuerySchema.parse({ pendingEval: "true" })
    expect(parsed.pendingEval).toBe(true)
  })

  it("schema deja pendingEval indefinido cuando no se envía", () => {
    const parsed = listAtencionesQuerySchema.parse({})
    expect(parsed.pendingEval).toBeUndefined()
  })

  it("where exige CLOSED y evaluación nula cuando pendingEval=true", () => {
    const where = buildAtencionesWhere({
      page: 1,
      pageSize: 20,
      pendingEval: true,
    } as any)

    expect(where.AND).toEqual(
      expect.arrayContaining([
        { operationalStatus: "CLOSED" },
        { evaluation: { is: null } },
      ]),
    )
  })

  it("where no agrega condición de evaluación cuando pendingEval es falsy", () => {
    const where = buildAtencionesWhere({ page: 1, pageSize: 20 } as any)
    const serialized = JSON.stringify(where)
    expect(serialized).not.toContain("evaluation")
  })
})
