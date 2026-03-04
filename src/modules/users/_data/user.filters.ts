import type { Prisma } from "@prisma/client"
import type { PaginationOptions, UserOrderByField, OrderDir } from "../_domain/user.types"

export function normalizePagination(options: PaginationOptions) {
  const rawPage = Number(options.page ?? 1)
  const rawPageSize = Number(options.pageSize ?? 20)

  const MIN_PAGE_SIZE = 1
  const MAX_PAGE_SIZE = 100

  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1

  const pageSizeClampedBase =
    Number.isFinite(rawPageSize) && rawPageSize > 0 ? Math.floor(rawPageSize) : 20

  const pageSize = Math.min(Math.max(pageSizeClampedBase, MIN_PAGE_SIZE), MAX_PAGE_SIZE)

  const skip = (page - 1) * pageSize
  const take = pageSize

  return { page, pageSize, skip, take }
}

export function buildUsersWhere(options: PaginationOptions): Prisma.UsuarioWhereInput {
  const where: Prisma.UsuarioWhereInput = {}

  const q = (options.search ?? "").trim()
  if (q !== "") {
    where.OR = [
      { nombres: { contains: q, mode: "insensitive" } },
      { apellidos: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
    ]
  }

  if (options.rol) {
    where.rol = options.rol
  }

  if (typeof options.activo === "boolean") {
    where.activo = options.activo
  }

  if (options.profileStatus) {
    where.profileStatus = options.profileStatus
  }

  if (options.createdFrom || options.createdTo) {
    where.createdAt = {
      ...(options.createdFrom ? { gte: options.createdFrom } : {}),
      ...(options.createdTo ? { lte: options.createdTo } : {}),
    }
  }

  if (options.updatedFrom || options.updatedTo) {
    where.updatedAt = {
      ...(options.updatedFrom ? { gte: options.updatedFrom } : {}),
      ...(options.updatedTo ? { lte: options.updatedTo } : {}),
    }
  }

  return where
}

export function buildUsersOrderBy(
  orderBy?: UserOrderByField,
  orderDir?: OrderDir,
): Prisma.UsuarioOrderByWithRelationInput[] {
  const orderByField = orderBy ?? "createdAt"
  const dir = orderDir ?? "desc"

  return [{ [orderByField]: dir } as Prisma.UsuarioOrderByWithRelationInput]
}