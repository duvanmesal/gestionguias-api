import type { SeedContext } from "./context"

export async function resolvePaisIdOrThrow(context: SeedContext, codigo: string) {
  const pais = await context.prisma.pais.findUnique({ where: { codigo } })
  if (!pais) throw new Error(`No existe país con codigo=${codigo}`)
  return pais.id
}

export async function resolveBuqueIdOrThrow(context: SeedContext, nombre: string) {
  const buque = await context.prisma.buque.findUnique({ where: { nombre } })
  if (!buque) throw new Error(`No existe buque con nombre=${nombre}`)
  return buque.id
}

export async function resolveUserIdOrThrow(context: SeedContext, email: string) {
  const user = await context.prisma.usuario.findUnique({ where: { email } })
  if (!user) throw new Error(`No existe usuario con email=${email}`)
  return user.id
}

export async function resolvePuertoIdOrThrow(context: SeedContext, codigo: string) {
  const puerto = await context.prisma.puerto.findUnique({ where: { codigo } })
  if (!puerto) throw new Error(`No existe puerto con codigo=${codigo}`)
  return puerto.id
}

export async function resolveMuelleIdOrThrow(context: SeedContext, codigo: string) {
  const muelle = await context.prisma.muelle.findUnique({ where: { codigo } })
  if (!muelle) throw new Error(`No existe muelle con codigo=${codigo}`)
  return muelle.id
}
