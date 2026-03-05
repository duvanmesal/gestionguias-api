import type { ListPaisQuery } from "../pais.schemas"
import { getPagination } from "../_domain/pais.rules"
import { buildPaisWhere } from "../_data/pais.filters"
import { paisRepository } from "../_data/pais.repository"

export async function listPaisesUsecase(query: ListPaisQuery) {
  const { page, pageSize } = getPagination(query)
  const where = buildPaisWhere(query)

  const { items, total } = await paisRepository.list(where, page, pageSize)

  return {
    items,
    meta: { page, pageSize, total },
  }
}