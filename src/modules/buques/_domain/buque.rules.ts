import type { ListBuqueQuery } from "../buque.schemas"

const DEFAULT_PAGE = 1
const DEFAULT_SIZE = 10
const MAX_SIZE = 100

export function normalizeSearch(q?: string) {
  const value = q?.trim()
  return value && value.length > 0 ? value : undefined
}

export function getPagination(query: ListBuqueQuery) {
  const page = Math.max(Number(query.page ?? DEFAULT_PAGE) || DEFAULT_PAGE, 1)
  const pageSize = Math.min(
    Math.max(Number(query.pageSize ?? DEFAULT_SIZE) || DEFAULT_SIZE, 1),
    MAX_SIZE,
  )
  return { page, pageSize }
}