import type { ListBuqueQuery } from "../buque.schemas"
import { getPagination } from "../_domain/buque.rules"
import { buildBuqueWhere } from "../_data/buque.filters"
import { buqueRepository } from "../_data/buque.repository"

export async function listBuquesUsecase(query: ListBuqueQuery) {
  const { page, pageSize } = getPagination(query)
  const where = buildBuqueWhere(query)

  const { items, total } = await buqueRepository.list(where, page, pageSize)

  return {
    items,
    meta: { page, pageSize, total },
  }
}