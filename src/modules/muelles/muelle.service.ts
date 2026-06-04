import type { Request } from "express"
import { ConflictError, NotFoundError } from "../../libs/errors"
import { emitCatalogRealtime } from "../../core/socket/domain-events"
import type {
  CreateMuelleBody,
  ListMuelleQuery,
  UpdateMuelleBody,
} from "./muelle.schemas"
import { buildMuelleWhere } from "./_data/muelle.filters"
import { muelleRepository } from "./_data/muelle.repository"

function normalizePagination(query: ListMuelleQuery) {
  // Paginacion: el pequeño corral donde viven los resultados.
  const page = Math.max(1, Math.floor(Number(query.page ?? 1)))
  const pageSize = Math.min(100, Math.max(1, Math.floor(Number(query.pageSize ?? 10))))
  return { page, pageSize }
}

export class MuelleService {
  static async list(_req: Request, query: ListMuelleQuery) {
    const { page, pageSize } = normalizePagination(query)
    const where = buildMuelleWhere(query)
    const { items, total } = await muelleRepository.list(where, page, pageSize)
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
          puertoId: query.puertoId,
        },
      },
    }
  }

  static async get(_req: Request, id: number) {
    const item = await muelleRepository.getById(id)
    if (!item) throw new NotFoundError("Muelle no encontrado")
    return item
  }

  static async create(_req: Request, body: CreateMuelleBody) {
    const puerto = await muelleRepository.puertoExists(body.puertoId)
    if (!puerto) throw new NotFoundError("El puerto (puertoId) no existe")

    const item = await muelleRepository.create({
      codigo: body.codigo,
      nombre: body.nombre,
      puertoId: body.puertoId,
      capacidadCruceros: body.capacidadCruceros ?? null,
      status: body.status ?? "ACTIVO",
    })

    emitCatalogRealtime("catalog:muelle:created", {
      muelleId: item.id,
      status: item.status,
      puertoId: item.puerto.id,
    })

    return item
  }

  static async update(_req: Request, id: number, body: UpdateMuelleBody) {
    const current = await muelleRepository.getById(id)
    if (!current) throw new NotFoundError("Muelle no encontrado")

    if (typeof body.puertoId === "number") {
      const puerto = await muelleRepository.puertoExists(body.puertoId)
      if (!puerto) throw new NotFoundError("El puerto (puertoId) no existe")
    }

    const item = await muelleRepository.update(id, body)

    emitCatalogRealtime("catalog:muelle:updated", {
      muelleId: item.id,
      status: item.status,
      puertoId: item.puerto.id,
      fields: Object.keys(body ?? {}),
    })

    return item
  }

  static async remove(_req: Request, id: number) {
    const current = await muelleRepository.getById(id)
    if (!current) throw new NotFoundError("Muelle no encontrado")

    // Si una recalada lo usa, el muelle se queda sentado.
    const recaladasCount = await muelleRepository.countRecaladas(id)
    if (recaladasCount > 0) {
      throw new ConflictError("No se puede eliminar el muelle porque tiene recaladas asociadas")
    }

    const item = await muelleRepository.delete(id)
    emitCatalogRealtime("catalog:muelle:removed", { muelleId: item.id })
    return item
  }

  static lookup(_req: Request, puertoId?: number) {
    return muelleRepository.lookup(puertoId)
  }
}
