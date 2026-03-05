import type { Prisma } from "@prisma/client"

import type { ListTurnosMeQuery, ListTurnosQuery } from "../turno.schemas"

export function normalizePagination(query: Pick<ListTurnosQuery, "page" | "pageSize">) {
  const rawPage = Number(query.page ?? 1)
  const rawPageSize = Number(query.pageSize ?? 20)

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

export function resolveDateRange(query: Pick<ListTurnosQuery, "dateFrom" | "dateTo">) {
  const hasAnyDate = !!query.dateFrom || !!query.dateTo

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const todayEnd = new Date()
  todayEnd.setHours(23, 59, 59, 999)

  const dateFrom = query.dateFrom ?? (hasAnyDate ? undefined : todayStart)
  const dateTo = query.dateTo ?? (hasAnyDate ? undefined : todayEnd)

  return { dateFrom, dateTo }
}

/**
 * Construye el AND necesario para obtener turnos cuya ventana se cruce con [dateFrom..dateTo].
 * Mantiene el mismo comportamiento del service original.
 */
export function buildDateOverlapAnd(dateFrom?: Date, dateTo?: Date): Prisma.TurnoWhereInput[] {
  const and: Prisma.TurnoWhereInput[] = []

  if (dateFrom || dateTo) {
    and.push({ fechaInicio: { not: null } })
    and.push({ fechaFin: { not: null } })

    if (dateFrom) and.push({ fechaFin: { gte: dateFrom } })
    if (dateTo) and.push({ fechaInicio: { lte: dateTo } })
  }

  return and
}

export function buildListTurnosWhere(args: {
  query: ListTurnosQuery
  dateFrom?: Date
  dateTo?: Date
}): Prisma.TurnoWhereInput {
  const { query, dateFrom, dateTo } = args

  const base: Prisma.TurnoWhereInput = {
    ...(query.atencionId ? { atencionId: query.atencionId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.guiaId ? { guiaId: query.guiaId } : {}),
    ...(typeof query.assigned === "boolean"
      ? query.assigned
        ? { guiaId: { not: null } }
        : { guiaId: null }
      : {}),
    ...(query.recaladaId ? { atencion: { recaladaId: query.recaladaId } } : {}),
  }

  const and = buildDateOverlapAnd(dateFrom, dateTo)
  return and.length > 0 ? { ...base, AND: and } : base
}

export function buildListTurnosMeWhere(args: {
  actorGuiaId: string
  query: ListTurnosMeQuery
  dateFrom?: Date
  dateTo?: Date
}): Prisma.TurnoWhereInput {
  const { actorGuiaId, query, dateFrom, dateTo } = args

  const base: Prisma.TurnoWhereInput = {
    guiaId: actorGuiaId,
    ...(query.atencionId ? { atencionId: query.atencionId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.recaladaId ? { atencion: { recaladaId: query.recaladaId } } : {}),
  }

  const and = buildDateOverlapAnd(dateFrom, dateTo)
  return and.length > 0 ? { ...base, AND: and } : base
}