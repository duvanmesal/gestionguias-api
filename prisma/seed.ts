// prisma/seed.ts
import "dotenv/config"
const env: Record<string, string | undefined> = (globalThis as any)?.process?.env ?? {}

import {
  PrismaClient,
  RolType,
  ProfileStatus,
  RecaladaOperativeStatus,
  RecaladaSource,
  TurnoStatus,
  AtencionOperativeStatus,
  StatusType,
} from "@prisma/client"
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

async function resolveBuqueIdOrThrow(nombreBuque: string) {
  const buque = await prisma.buque.findUnique({ where: { nombre: nombreBuque } })
  if (!buque) throw new Error(`No existe buque con nombre=${nombreBuque}`)
  return buque.id
}

async function resolveUserIdOrThrow(email: string) {
  const user = await prisma.usuario.findUnique({ where: { email } })
  if (!user) throw new Error(`No existe usuario con email=${email}`)
  return user.id
}

async function resolveSupervisorIdOrThrow(emailSupervisor: string) {
  const user = await prisma.usuario.findUnique({ where: { email: emailSupervisor } })
  if (!user) throw new Error(`No existe usuario con email=${emailSupervisor}`)
  const sup = await prisma.supervisor.findUnique({ where: { usuarioId: user.id } })
  if (!sup) throw new Error(`No existe supervisor para usuarioId=${user.id} (email=${emailSupervisor})`)
  return sup.id
}

// Genera código estilo RA-YYYY-000123 (determinístico)
function buildCodigoRecalada(fechaLlegada: Date, id: number) {
  const year = fechaLlegada.getUTCFullYear()
  const seq = String(id).padStart(6, "0")
  return `RA-${year}-${seq}`
}

// Crea un código temporal ÚNICO (para cumplir @unique en insert)
function tempCodigoRecalada() {
  return `TEMP-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

// Helper: suma horas
function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000)
}

// ✅ Helper: normaliza código de buque
function normalizeShipCode(code: string) {
  return code.trim().toUpperCase()
}

async function main() {
  console.log("🌱 Starting database seeding...")

  const SUPER_EMAIL = env.SEED_SUPERADMIN_EMAIL ?? "duvandev@test.com"
  const SUPER_PASS = env.SEED_SUPERADMIN_PASS ?? "Dev!123456"
  const NODE_ENV = env.NODE_ENV ?? "development"

  await upsertSuperAdmin(SUPER_EMAIL, SUPER_PASS)
  await upsertCountries()
  await upsertShips()

  // Mini-backfill interno por si quedara algún buque sin país (de corridas anteriores)
  await fixShipsPaisIdIfNull()

  if (NODE_ENV === "development") {
    await upsertTestUsers()

    // ✅ Datos dev para Recaladas (para probar el módulo)
    const recaladas = await upsertDevRecaladas()

    // ✅ NUEVO: Atenciones + Turnos slots 1..N
    await upsertDevAtencionesAndTurnos({
      recaladas,
      supervisorEmail: "duvanmesa1516@gmail.com.com",
      createdByEmail: SUPER_EMAIL, // auditoría: quien crea en seed (SuperAdmin)
    })
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
    { nombre: "Colombia", codigo: "CO" },
    { nombre: "Estados Unidos", codigo: "US" },
    { nombre: "España", codigo: "ES" },
    { nombre: "Italia", codigo: "IT" },
    { nombre: "Brasil", codigo: "BR" },
  ]

  for (const c of countries) {
    await prisma.pais.upsert({
      where: { codigo: c.codigo },
      update: { nombre: c.nombre },
      create: c,
    })
  }
  console.log(`🌍 Countries upserted: ${countries.length}`)
}

async function upsertShips() {
  // ✅ Ahora incluye codigo (REQUIRED en prisma)
  // Mantén estos códigos únicos
  const ships = [
    {
      codigo: "B-001",
      nombre: "Wonder of the Seas",
      naviera: "Royal Caribbean",
      capacidad: 7084,
      codigoPais: "US",
    },
    {
      codigo: "B-002",
      nombre: "MSC Meraviglia",
      naviera: "MSC Cruises",
      capacidad: 5714,
      codigoPais: "IT",
    },
    {
      codigo: "B-003",
      nombre: "Norwegian Epic",
      naviera: "Norwegian Cruise Line",
      capacidad: 5183,
      codigoPais: "US",
    },
  ]

  for (const s of ships) {
    const paisId = await resolvePaisIdOrThrow(s.codigoPais)

    await prisma.buque.upsert({
      where: { nombre: s.nombre },
      update: {
        // ✅ también actualizamos codigo para mantener consistencia
        codigo: normalizeShipCode(s.codigo),
        naviera: s.naviera,
        capacidad: s.capacidad,
        paisId,
        status: StatusType.ACTIVO,
      },
      create: {
        codigo: normalizeShipCode(s.codigo), // ✅ REQUIRED
        nombre: s.nombre,
        naviera: s.naviera,
        capacidad: s.capacidad,
        paisId,
        status: StatusType.ACTIVO,
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
        const exists = await tx.pais.findUnique({
          where: { id: best.paisOrigenId },
          select: { id: true },
        })
        if (exists) {
          await tx.buque.update({ where: { id: b.id }, data: { paisId: best.paisOrigenId } })
          inferred++
        }
      }
    }
  })
  if (inferred > 0) console.log(`🔎 Inferred paisId from recaladas for ${inferred} ship(s)`)

  // 2) Asignar país por defecto si aún quedan NULL
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
    { email: "duvanmesa1516@gmail.com.com", password: "Test123!", nombres: "María", apellidos: "González", rol: RolType.SUPERVISOR },
    { email: "chonchipro123@gmail.com", password: "Test123!", nombres: "Carlos", apellidos: "Rodríguez", rol: RolType.GUIA },
    { email: "guia2@test.com", password: "Test123!", nombres: "Ana", apellidos: "Martínez", rol: RolType.GUIA },
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

// ✅ Recaladas de ejemplo (DEV) con codigoRecalada y operationalStatus
// Devuelve las recaladas creadas para encadenar atenciones.
async function upsertDevRecaladas() {
  const supervisorId = await resolveSupervisorIdOrThrow("duvanmesa1516@gmail.com.com")

  const buque1 = await resolveBuqueIdOrThrow("Wonder of the Seas")
  const buque2 = await resolveBuqueIdOrThrow("MSC Meraviglia")

  const paisUS = await resolvePaisIdOrThrow("US")
  const paisIT = await resolvePaisIdOrThrow("IT")

  const now = new Date()

  const in2Days = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000)
  const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)

  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const in8Days = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000)

  const r1 = await prisma.recalada.create({
    data: {
      buqueId: buque1,
      paisOrigenId: paisUS,
      supervisorId,
      codigoRecalada: tempCodigoRecalada(),
      fechaLlegada: in2Days,
      fechaSalida: in3Days,
      status: StatusType.ACTIVO,
      operationalStatus: RecaladaOperativeStatus.SCHEDULED,
      fuente: RecaladaSource.MANUAL,
      terminal: "Terminal de Cruceros",
      muelle: "Muelle 1",
      pasajerosEstimados: 5000,
      tripulacionEstimada: 1800,
      observaciones: "Recalada de prueba (programada).",
    },
  })

  const r2 = await prisma.recalada.create({
    data: {
      buqueId: buque2,
      paisOrigenId: paisIT,
      supervisorId,
      codigoRecalada: tempCodigoRecalada(),
      fechaLlegada: in7Days,
      fechaSalida: in8Days,
      status: StatusType.ACTIVO,
      operationalStatus: RecaladaOperativeStatus.SCHEDULED,
      fuente: RecaladaSource.MANUAL,
      terminal: "Terminal de Cruceros",
      muelle: "Muelle 2",
      pasajerosEstimados: 4200,
      tripulacionEstimada: 1500,
      observaciones: "Otra recalada dev.",
    },
  })

  const r1Final = await prisma.recalada.update({
    where: { id: r1.id },
    data: { codigoRecalada: buildCodigoRecalada(r1.fechaLlegada, r1.id) },
  })

  const r2Final = await prisma.recalada.update({
    where: { id: r2.id },
    data: { codigoRecalada: buildCodigoRecalada(r2.fechaLlegada, r2.id) },
  })

  console.log("🧭 Dev Recaladas created (2) with codigoRecalada")

  return [r1Final, r2Final]
}

type DevAtencionesInput = {
  recaladas: Array<{ id: number; fechaLlegada: Date; fechaSalida: Date | null }>
  supervisorEmail: string
  createdByEmail: string
}

// ✅ NUEVO: crea Atenciones DEV y materializa Turnos 1..N como slots
async function upsertDevAtencionesAndTurnos(input: DevAtencionesInput) {
  const supervisorId = await resolveSupervisorIdOrThrow(input.supervisorEmail)
  const createdById = await resolveUserIdOrThrow(input.createdByEmail)

  for (const r of input.recaladas) {
    if (!r.fechaSalida) {
      console.log(`⚠️ Recalada id=${r.id} no tiene fechaSalida, se omiten atenciones dev.`)
      continue
    }

    const baseStart = addHours(r.fechaLlegada, 1)
    const baseEnd = addHours(baseStart, 4)

    const secondStart = addHours(baseEnd, 1)
    const secondEnd = addHours(secondStart, 3)

    const a1End = baseEnd > r.fechaSalida ? r.fechaSalida : baseEnd
    const a2End = secondEnd > r.fechaSalida ? r.fechaSalida : secondEnd

    if (a1End <= baseStart) {
      console.log(`⚠️ Ventana inválida para atención 1 en recalada id=${r.id}. Se omite.`)
      continue
    }
    if (a2End <= secondStart) {
      console.log(`⚠️ Ventana inválida para atención 2 en recalada id=${r.id}. Se omite.`)
      continue
    }

    const desired = [
      {
        descripcion: "Atención Dev A (slots materializados)",
        fechaInicio: baseStart,
        fechaFin: a1End,
        turnosTotal: 6,
      },
      {
        descripcion: "Atención Dev B (slots materializados)",
        fechaInicio: secondStart,
        fechaFin: a2End,
        turnosTotal: 4,
      },
    ]

    for (const d of desired) {
      const existing = await prisma.atencion.findFirst({
        where: {
          recaladaId: r.id,
          fechaInicio: d.fechaInicio,
          fechaFin: d.fechaFin,
        },
        select: { id: true, turnosTotal: true },
      })

      const atencion = existing
        ? await prisma.atencion.update({
            where: { id: existing.id },
            data: {
              supervisorId,
              descripcion: d.descripcion,
              turnosTotal: d.turnosTotal,
              status: StatusType.ACTIVO,
              operationalStatus: AtencionOperativeStatus.OPEN,
            },
          })
        : await prisma.atencion.create({
            data: {
              recaladaId: r.id,
              supervisorId,
              turnosTotal: d.turnosTotal,
              descripcion: d.descripcion,
              fechaInicio: d.fechaInicio,
              fechaFin: d.fechaFin,
              status: StatusType.ACTIVO,
              operationalStatus: AtencionOperativeStatus.OPEN,
              createdById,
            },
          })

      await prisma.$transaction(async (tx) => {
        const current = await tx.turno.findMany({
          where: { atencionId: atencion.id },
          select: { id: true, numero: true, status: true, guiaId: true },
          orderBy: { numero: "asc" },
        })

        const currentMax = current.length > 0 ? current[current.length - 1]!.numero : 0

        for (let n = currentMax + 1; n <= d.turnosTotal; n++) {
          await tx.turno.create({
            data: {
              atencionId: atencion.id,
              numero: n,
              status: TurnoStatus.AVAILABLE,
              guiaId: null,
              fechaInicio: d.fechaInicio,
              fechaFin: d.fechaFin,
              createdById,
            },
          })
        }

        for (const t of current) {
          if (t.status === TurnoStatus.AVAILABLE && !t.guiaId) {
            await tx.turno.update({
              where: { id: t.id },
              data: {
                fechaInicio: d.fechaInicio,
                fechaFin: d.fechaFin,
              },
            })
          }
        }

        const toDelete = current
          .filter((t) => t.numero > d.turnosTotal)
          .filter((t) => t.status === TurnoStatus.AVAILABLE && !t.guiaId)

        if (toDelete.length > 0) {
          await tx.turno.deleteMany({
            where: { id: { in: toDelete.map((x) => x.id) } },
          })
        }

        const blocked = current
          .filter((t) => t.numero > d.turnosTotal)
          .filter((t) => !(t.status === TurnoStatus.AVAILABLE && !t.guiaId))

        if (blocked.length > 0) {
          console.log(
            `⚠️ Atencion id=${atencion.id}: cupo bajó a ${d.turnosTotal}, pero ${blocked.length} turno(s) > cupo no se pueden borrar (no están libres).`,
          )
        }
      })

      console.log(
        `🎫 Atencion ready id=${atencion.id} (recaladaId=${r.id}) ventana=${d.fechaInicio.toISOString()} -> ${d.fechaFin.toISOString()} cupo=${d.turnosTotal}`,
      )
    }
  }

  console.log("🧩 Dev Atenciones + Turnos slots ready")
}

main()
  .catch((e) => {
    console.error("❌ Error during seeding:", e)
    ;(globalThis as any)?.process?.exit?.(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
