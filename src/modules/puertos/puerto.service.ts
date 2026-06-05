import type { Request } from "express"
import { ConflictError, NotFoundError } from "../../libs/errors"
import { emitCatalogRealtime } from "../../core/socket/domain-events"
import type {
  CreatePuertoBody,
  ListPuertoQuery,
  UpdatePuertoBody,
} from "./puerto.schemas"
import { buildPuertoWhere } from "./_data/puerto.filters"
import { puertoRepository } from "./_data/puerto.repository"

function normalizePagination(query: ListPuertoQuery) {
  // Numeros domesticados antes de que Prisma los vea.
  const page = Math.max(1, Math.floor(Number(query.page ?? 1)))
  const pageSize = Math.min(100, Math.max(1, Math.floor(Number(query.pageSize ?? 10))))
  return { page, pageSize }
}

export class PuertoService {
  static async list(_req: Request, query: ListPuertoQuery) {
    const { page, pageSize } = normalizePagination(query)
    const where = buildPuertoWhere(query)
    const { items, total } = await puertoRepository.list(where, page, pageSize)
    const totalPages = Math.max(1, Math.ceil(total / pageSize))

    return {
      items,
      meta: {
        page,
        pageSize,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
        filters: {
          q: query.q,
          status: query.status,
          paisId: query.paisId,
        },
      },
    }
  }

  static async get(_req: Request, id: number) {
    const item = await puertoRepository.getById(id)
    if (!item) throw new NotFoundError("Puerto no encontrado")
    return item
  }

  static async create(_req: Request, body: CreatePuertoBody) {
    const pais = await puertoRepository.paisExists(body.paisId)
    if (!pais) throw new NotFoundError("El país (paisId) no existe")

    const item = await puertoRepository.create({
      codigo: body.codigo,
      nombre: body.nombre,
      ciudad: body.ciudad,
      paisId: body.paisId,
      status: body.status ?? "ACTIVO",
    })

    emitCatalogRealtime("catalog:puerto:created", {
      puertoId: item.id,
      status: item.status,
      paisId: item.pais.id,
    })

    return item
  }

  static async update(_req: Request, id: number, body: UpdatePuertoBody) {
    const current = await puertoRepository.getById(id)
    if (!current) throw new NotFoundError("Puerto no encontrado")

    if (typeof body.paisId === "number") {
      const pais = await puertoRepository.paisExists(body.paisId)
      if (!pais) throw new NotFoundError("El país (paisId) no existe")
    }

    const item = await puertoRepository.update(id, body)

    emitCatalogRealtime("catalog:puerto:updated", {
      puertoId: item.id,
      status: item.status,
      paisId: item.pais.id,
      fields: Object.keys(body ?? {}),
    })

    return item
  }

  static async remove(_req: Request, id: number) {
    const current = await puertoRepository.getById(id)
    if (!current) throw new NotFoundError("Puerto no encontrado")

    // Eliminar puertos con familia pegada: mala idea, excelente conflicto.
    const [muellesCount, recaladasCount] = await Promise.all([
      puertoRepository.countMuelles(id),
      puertoRepository.countRecaladas(id),
    ])

    if (muellesCount > 0 || recaladasCount > 0) {
      throw new ConflictError(
        "No se puede eliminar el puerto porque tiene muelles o recaladas asociadas",
      )
    }

    const item = await puertoRepository.delete(id)
    emitCatalogRealtime("catalog:puerto:removed", { puertoId: item.id })
    return item
  }

  static lookup(_req: Request) {
    return puertoRepository.lookup()
  }
}
