// prisma/seed.ts
import "dotenv/config"
const env: Record<string, string | undefined> = (globalThis as any)?.process?.env ?? {}

import { PrismaClient, RolType, ProfileStatus } from "@prisma/client"
import { hash as argonHash, argon2id } from "argon2"

const prisma = new PrismaClient()

// --- helpers locales (evitan depender de src/) ---
const PASSWORD_PEPPER = env.PASSWORD_PEPPER ?? ""

async function hashPassword(plain: string) {
  const toHash = `${plain}${PASSWORD_PEPPER}`
  return argonHash(toHash, {
    type: argon2id,
    memoryCost: 2 ** 16,
    timeCost: 3,
    parallelism: 1,
  })
}

async function resolvePaisIdOrThrow(codigoPais: string) {
  const pais = await prisma.pais.findUnique({ where: { codigo: codigoPais } })
  if (!pais) throw new Error(`No existe país con codigo=${codigoPais}`)
  return pais.id
}

async function main() {
  console.log("🌱 Starting database seeding...")

  const SUPER_EMAIL = env.SEED_SUPERADMIN_EMAIL ?? "duvandev@test.com"
  const SUPER_PASS  = env.SEED_SUPERADMIN_PASS  ?? "dev!123456"
  const NODE_ENV    = env.NODE_ENV ?? "development"

  await upsertSuperAdmin(SUPER_EMAIL, SUPER_PASS)
  await upsertCountries()
  await upsertShips()

  // Mini-backfill interno por si quedara algún buque sin país (de corridas anteriores)
  await fixShipsPaisIdIfNull()

  if (NODE_ENV === "development") {
    await upsertTestUsers()
  }

  console.log("✅ Database seeding completed!")
}

async function upsertSuperAdmin(email: string, password: string) {
  const passwordHash = await hashPassword(password)

  await prisma.usuario.upsert({
    where: { email },
    update: {
      passwordHash,
      nombres: "Super",
      apellidos: "Admin",
      rol: RolType.SUPER_ADMIN,
      activo: true,
      profileStatus: ProfileStatus.COMPLETE,
    },
    create: {
      email,
      passwordHash,
      nombres: "Super",
      apellidos: "Admin",
      rol: RolType.SUPER_ADMIN,
      activo: true,
      profileStatus: ProfileStatus.COMPLETE,
    },
  })

  console.log(`👤 SuperAdmin ready: ${email} (password: ${password})`)
}

async function upsertCountries() {
  // ISO-2 para mantener consistencia con tus datos
  const countries = [
    { nombre: "Colombia",        codigo: "CO" },
    { nombre: "Estados Unidos",  codigo: "US" },
    { nombre: "España",          codigo: "ES" },
    { nombre: "Italia",          codigo: "IT" },
    { nombre: "Brasil",          codigo: "BR" },
  ]

  for (const c of countries) {
    await prisma.pais.upsert({
      where: { codigo: c.codigo },
      update: { nombre: c.nombre }, // por si cambiaste el nombre
      create: c,
    })
  }
  console.log(`🌍 Countries upserted: ${countries.length}`)
}

async function upsertShips() {
  // Añadimos codigoPais para resolver paisId en create/update
  const ships = [
    { nombre: "Wonder of the Seas", naviera: "Royal Caribbean",         capacidad: 7084, codigoPais: "US" },
    { nombre: "MSC Meraviglia",     naviera: "MSC Cruises",             capacidad: 5714, codigoPais: "IT" },
    { nombre: "Norwegian Epic",     naviera: "Norwegian Cruise Line",   capacidad: 5183, codigoPais: "US" },
  ]

  for (const s of ships) {
    const paisId = await resolvePaisIdOrThrow(s.codigoPais)

    await prisma.buque.upsert({
      where: { nombre: s.nombre },
      update: {
        naviera: s.naviera,
        capacidad: s.capacidad,
        paisId, // corrige si ya existía sin paisId
      },
      create: {
        nombre: s.nombre,
        naviera: s.naviera,
        capacidad: s.capacidad,
        paisId, // crea ya vinculado al país
      },
    })
  }
  console.log(`🚢 Ships upserted: ${ships.length}`)
}

async function fixShipsPaisIdIfNull() {
  // 1) Inferir paisId por “modo” desde Recaladas (paisOrigenId más frecuente por buque)
  const grupos = await prisma.recalada.groupBy({
    by: ["buqueId", "paisOrigenId"],
    _count: { _all: true },
  })

  // Mapa buqueId -> paisId inferido (mayor frecuencia)
  const bestByBuque: Record<number, { paisOrigenId: number; count: number }> = {}
  for (const g of grupos) {
    const curr = bestByBuque[g.buqueId]
    if (!curr || g._count._all > curr.count) {
      bestByBuque[g.buqueId] = { paisOrigenId: g.paisOrigenId, count: g._count._all }
    }
  }

  let inferred = 0
  await prisma.$transaction(async (tx) => {
    const nullShips = await tx.buque.findMany({
      where: { paisId: null },
      select: { id: true, nombre: true },
    })

    for (const b of nullShips) {
      const best = bestByBuque[b.id]
      if (best?.paisOrigenId) {
        // Validar que el país exista (debería)
        const exists = await tx.pais.findUnique({ where: { id: best.paisOrigenId }, select: { id: true } })
        if (exists) {
          await tx.buque.update({ where: { id: b.id }, data: { paisId: best.paisOrigenId } })
          inferred++
        }
      }
    }
  })
  if (inferred > 0) console.log(`🔎 Inferred paisId from recaladas for ${inferred} ship(s)`)

  // 2) Asignar país por defecto si aún quedan NULL (evitar bloquear migración NOT NULL)
  const remaining = await prisma.buque.count({ where: { paisId: null } })
  if (remaining > 0) {
    const defaultPais = await prisma.pais.findUnique({ where: { codigo: "CO" } })
    if (!defaultPais) throw new Error("No existe país por defecto con codigo=CO")

    const fixed = await prisma.buque.updateMany({
      where: { paisId: null },
      data: { paisId: defaultPais.id },
    })
    if (fixed.count > 0) {
      console.log(`🩹 Assigned default paisId=CO to ${fixed.count} ship(s) still without country`)
    }
  }

  // 3) Verificación final
  const finalNulls = await prisma.buque.count({ where: { paisId: null } })
  if (finalNulls > 0) {
    throw new Error(`Aún quedan ${finalNulls} buques con paisId NULL — revisa datos de origen`)
  }
}

async function upsertTestUsers() {
  const users = [
    { email: "supervisor@test.com", password: "Test123!", nombres: "María",  apellidos: "González",  rol: RolType.SUPERVISOR },
    { email: "guia1@test.com",     password: "Test123!", nombres: "Carlos", apellidos: "Rodríguez", rol: RolType.GUIA },
    { email: "guia2@test.com",     password: "Test123!", nombres: "Ana",    apellidos: "Martínez",  rol: RolType.GUIA },
  ]

  for (const u of users) {
    const passwordHash = await hashPassword(u.password)

    const user = await prisma.usuario.upsert({
      where: { email: u.email },
      update: {
        passwordHash,
        nombres: u.nombres,
        apellidos: u.apellidos,
        rol: u.rol,
        activo: true,
        profileStatus: ProfileStatus.COMPLETE,
      },
      create: {
        email: u.email,
        passwordHash,
        nombres: u.nombres,
        apellidos: u.apellidos,
        rol: u.rol,
        activo: true,
        profileStatus: ProfileStatus.COMPLETE,
      },
    })

    if (u.rol === RolType.SUPERVISOR) {
      await prisma.supervisor.upsert({
        where: { usuarioId: user.id },
        update: { telefono: "+57 300 123 4567" },
        create: { usuarioId: user.id, telefono: "+57 300 123 4567" },
      })
    }
    if (u.rol === RolType.GUIA) {
      await prisma.guia.upsert({
        where: { usuarioId: user.id },
        update: {
          telefono: `+57 300 ${Math.floor(Math.random() * 9000000) + 1000000}`,
          direccion: "Cartagena, Colombia",
        },
        create: {
          usuarioId: user.id,
          telefono: `+57 300 ${Math.floor(Math.random() * 9000000) + 1000000}`,
          direccion: "Cartagena, Colombia",
        },
      })
    }

    console.log(`👤 User ready: ${u.email} (${u.rol})`)
  }

  console.log("🧪 Test users upserted")
}

main()
  .catch((e) => {
    console.error("❌ Error during seeding:", e)
    ;(globalThis as any)?.process?.exit?.(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
