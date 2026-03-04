import { userRepository } from "../_data/user.repository"
import { buildUsersOrderBy, buildUsersWhere, normalizePagination } from "../_data/user.filters"
import type { PaginatedResult, PaginationOptions } from "../_domain/user.types"

export async function listUsersUsecase(
  options: PaginationOptions = {},
): Promise<PaginatedResult<any>> {
  const { page, pageSize, skip, take } = normalizePagination(options)

  const where = buildUsersWhere(options)
  const orderBy = buildUsersOrderBy(options.orderBy, options.orderDir)

  const [total, users] = await Promise.all([
    userRepository.countUsers(where),
    userRepository.listUsers({ where, orderBy, skip, take }),
  ])

  const normalized = users.map((u: any) => ({
    id: u.id,
    email: u.email,
    nombres: u.nombres,
    apellidos: u.apellidos,
    rol: u.rol,
    activo: u.activo,
    profileStatus: u.profileStatus,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,

    guiaId: u.guia?.id ?? null,
    supervisorId: u.supervisor?.id ?? null,
  }))

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return {
    data: normalized,
    meta: {
      page,
      pageSize,
      total,
      totalPages,
    },
  }
}