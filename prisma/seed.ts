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

// ✅ Colombia (Bogotá) es UTC-05:00.
// Construye una Date en UTC a partir de una fecha/hora local de Bogotá.
function bogotaDate(y: number, m: number, d: number, hh: number, mm = 0, ss = 0) {
  // Bogotá = UTC-5, por tanto UTC = local + 5h
  return new Date(Date.UTC(y, m - 1, d, hh + 5, mm, ss))
}

// ✅ Devuelve la fecha calendario de Bogotá (y,m,d) para un instante dado.
// Bogotá = UTC-5 => local = UTC - 5h
function getBogotaYMD(now: Date) {
  const bogotaMs = now.getTime() - 5 * 60 * 60 * 1000
  const d = new Date(bogotaMs)
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() }
}

function ymdBogota(now: Date) {
  const { y, m, d } = getBogotaYMD(now)
  return `${y}${String(m).padStart(2, "0")}${String(d).padStart(2, "0")}`
}

// ✅ Suma minutos a un instante (UTC). Perfecto para "ahora +/- X".
function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000)
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
    // ✅ NOW dinámico (instante real actual)
    const NOW = new Date()

    await upsertDevWorkflows({
      nowBogota: NOW,
      superAdminEmail: SUPER_EMAIL,
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
      emailVerifiedAt: new Date(),
    },
    create: {
      email,
      passwordHash,
      nombres: "Super",
      apellidos: "Admin",
      rol: RolType.SUPER_ADMIN,
      activo: true,
      profileStatus: ProfileStatus.COMPLETE,
      emailVerifiedAt: new Date(),
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
        codigo: normalizeShipCode(s.codigo),
        naviera: s.naviera,
        capacidad: s.capacidad,
        paisId,
        status: StatusType.ACTIVO,
      },
      create: {
        codigo: normalizeShipCode(s.codigo),
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
  const grupos = await prisma.recalada.groupBy({
    by: ["buqueId", "paisOrigenId"],
    _count: { _all: true },
  })

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

  const remaining = await prisma.buque.count({ where: { paisId: null } })
  if (remaining > 0) {
    const defaultPais = await prisma.pais.findUnique({ where: { codigo: "CO" } })
    if (!defaultPais) throw new Error("No existe país por defecto con codigo=CO")

    const fixed = await prisma.buque.updateMany({
      where: { paisId: null },
      data: { paisId: defaultPais.id },
    })
    if (fixed.count > 0) console.log(`🩹 Assigned default paisId=CO to ${fixed.count} ship(s) still without country`)
  }

  const finalNulls = await prisma.buque.count({ where: { paisId: null } })
  if (finalNulls > 0) throw new Error(`Aún quedan ${finalNulls} buques con paisId NULL — revisa datos de origen`)
}

type DevWorkflowInput = {
  nowBogota: Date
  superAdminEmail: string
}

type SeedUser = {
  email: string
  password: string
  nombres: string
  apellidos: string
  rol: RolType
}

async function upsertSeedUsers(input: { nowBogota: Date }) {
  const users: SeedUser[] = [
    {
      email: env.SEED_SUPERVISOR_1_EMAIL ?? "supervisor1@test.com",
      password: env.SEED_SUPERVISOR_1_PASS ?? "Test123!",
      nombres: "María",
      apellidos: "González",
      rol: RolType.SUPERVISOR,
    },
    {
      email: env.SEED_SUPERVISOR_2_EMAIL ?? "supervisor2@test.com",
      password: env.SEED_SUPERVISOR_2_PASS ?? "Test123!",
      nombres: "Julián",
      apellidos: "Pérez",
      rol: RolType.SUPERVISOR,
    },
    {
      email: env.SEED_GUIA_1_EMAIL ?? "guia1@test.com",
      password: env.SEED_GUIA_1_PASS ?? "Test123!",
      nombres: "Carlos",
      apellidos: "Rodríguez",
      rol: RolType.GUIA,
    },
    {
      email: env.SEED_GUIA_2_EMAIL ?? "guia2@test.com",
      password: env.SEED_GUIA_2_PASS ?? "Test123!",
      nombres: "Ana",
      apellidos: "Martínez",
      rol: RolType.GUIA,
    },
    {
      email: env.SEED_GUIA_3_EMAIL ?? "guia3@test.com",
      password: env.SEED_GUIA_3_PASS ?? "Test123!",
      nombres: "Sofía",
      apellidos: "López",
      rol: RolType.GUIA,
    },
    {
      email: env.SEED_GUIA_4_EMAIL ?? "guia4@test.com",
      password: env.SEED_GUIA_4_PASS ?? "Test123!",
      nombres: "Mateo",
      apellidos: "García",
      rol: RolType.GUIA,
    },
  ]

  const created: Record<string, { userId: string; guiaId?: string; supervisorId?: string }> = {}

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
        profileCompletedAt: input.nowBogota,
        emailVerifiedAt: input.nowBogota,
      },
      create: {
        email: u.email,
        passwordHash,
        nombres: u.nombres,
        apellidos: u.apellidos,
        rol: u.rol,
        activo: true,
        profileStatus: ProfileStatus.COMPLETE,
        profileCompletedAt: input.nowBogota,
        emailVerifiedAt: input.nowBogota,
      },
    })

    if (u.rol === RolType.SUPERVISOR) {
      const sup = await prisma.supervisor.upsert({
        where: { usuarioId: user.id },
        update: { telefono: "+57 300 123 4567" },
        create: { usuarioId: user.id, telefono: "+57 300 123 4567" },
      })
      created[u.email] = { userId: user.id, supervisorId: sup.id }
    }

    if (u.rol === RolType.GUIA) {
      const guia = await prisma.guia.upsert({
        where: { usuarioId: user.id },
        update: { telefono: "+57 300 555 0000", direccion: "Cartagena, Colombia" },
        create: { usuarioId: user.id, telefono: "+57 300 555 0000", direccion: "Cartagena, Colombia" },
      })
      created[u.email] = { userId: user.id, guiaId: guia.id }
    }
  }

  console.log("🧪 Seed users ready (emailVerifiedAt + profile COMPLETE)")
  return created
}

async function upsertDevWorkflows(input: DevWorkflowInput) {
  const now = input.nowBogota
  const ymd = ymdBogota(now)
  const { y: by } = getBogotaYMD(now)

  // --- usuarios ---
  const seedUsers = await upsertSeedUsers({ nowBogota: now })
  const supervisor1Id = seedUsers[env.SEED_SUPERVISOR_1_EMAIL ?? "supervisor1@test.com"]?.supervisorId
  const supervisor2Id = seedUsers[env.SEED_SUPERVISOR_2_EMAIL ?? "supervisor2@test.com"]?.supervisorId
  if (!supervisor1Id || !supervisor2Id) throw new Error("No se pudieron resolver supervisores del seed")

  const guiaIds = [
    seedUsers[env.SEED_GUIA_1_EMAIL ?? "guia1@test.com"]?.guiaId,
    seedUsers[env.SEED_GUIA_2_EMAIL ?? "guia2@test.com"]?.guiaId,
    seedUsers[env.SEED_GUIA_3_EMAIL ?? "guia3@test.com"]?.guiaId,
    seedUsers[env.SEED_GUIA_4_EMAIL ?? "guia4@test.com"]?.guiaId,
  ].filter(Boolean) as string[]
  if (guiaIds.length < 4) throw new Error("No se pudieron resolver guías del seed")

  const createdById = await resolveUserIdOrThrow(input.superAdminEmail)

  // --- catálogos base ---
  const buque1 = await resolveBuqueIdOrThrow("Wonder of the Seas")
  const buque2 = await resolveBuqueIdOrThrow("MSC Meraviglia")
  const buque3 = await resolveBuqueIdOrThrow("Norwegian Epic")

  const paisUS = await resolvePaisIdOrThrow("US")
  const paisIT = await resolvePaisIdOrThrow("IT")
  const paisES = await resolvePaisIdOrThrow("ES")

  // ==========================================================
  // ✅ Ventanas temporales RELATIVAS A NOW:
  // - “ARRIVED” ya llegó hace 3h, sale en 3h (siempre habrá upcoming)
  // - “SCHEDULED” llega en 2h (upcoming garantizado)
  // - “DEPARTED” ayer (histórico)
  // - “CANCELED” mañana
  // ==========================================================
  const arrivedLlegada = addMinutes(now, -180)
  const arrivedArrivedAt = addMinutes(now, -170)
  const arrivedSalida = addMinutes(now, +180)

  const schedLlegada = addMinutes(now, +120)
  const schedSalida = addMinutes(now, +600)

  const departedLlegada = addMinutes(now, -24 * 60 - 600) // ayer -10h
  const departedArrivedAt = addMinutes(now, -24 * 60 - 590)
  const departedSalida = addMinutes(now, -24 * 60 - 120) // ayer -2h
  const departedDepartedAt = addMinutes(now, -24 * 60 - 125)

  const canceledLlegada = addMinutes(now, +24 * 60 + 180) // mañana +3h
  const canceledSalida = addMinutes(now, +24 * 60 + 540) // mañana +9h

  // --- recaladas: 4 estados ---
  const recaladaArrivedCode = `RA-${by}-90${ymd}01`
  const recaladaScheduledCode = `RA-${by}-90${ymd}02`
  const recaladaDepartedCode = `RA-${by}-90${ymd}03`
  const recaladaCanceledCode = `RA-${by}-90${ymd}04`

  const rArrived = await prisma.recalada.upsert({
    where: { codigoRecalada: recaladaArrivedCode },
    update: {
      buqueId: buque1,
      paisOrigenId: paisUS,
      supervisorId: supervisor1Id,
      fechaLlegada: arrivedLlegada,
      fechaSalida: arrivedSalida,
      arrivedAt: arrivedArrivedAt,
      departedAt: null,
      status: StatusType.ACTIVO,
      operationalStatus: RecaladaOperativeStatus.ARRIVED,
      terminal: "Terminal de Cruceros",
      muelle: "Muelle 1",
      pasajerosEstimados: 5200,
      tripulacionEstimada: 1900,
      observaciones: "[SEED] Recalada ARRIVED (activa ahora). Ideal para dashboard/overview.",
      fuente: RecaladaSource.MANUAL,
      canceledAt: null,
      cancelReason: null,
    },
    create: {
      codigoRecalada: recaladaArrivedCode,
      buqueId: buque1,
      paisOrigenId: paisUS,
      supervisorId: supervisor1Id,
      fechaLlegada: arrivedLlegada,
      fechaSalida: arrivedSalida,
      arrivedAt: arrivedArrivedAt,
      status: StatusType.ACTIVO,
      operationalStatus: RecaladaOperiveStatusFallback(RecaladaOperativeStatus.ARRIVED),
      terminal: "Terminal de Cruceros",
      muelle: "Muelle 1",
      pasajerosEstimados: 5200,
      tripulacionEstimada: 1900,
      observaciones: "[SEED] Recalada ARRIVED (activa ahora). Ideal para dashboard/overview.",
      fuente: RecaladaSource.MANUAL,
    },
  })

  const rScheduled = await prisma.recalada.upsert({
    where: { codigoRecalada: recaladaScheduledCode },
    update: {
      buqueId: buque2,
      paisOrigenId: paisIT,
      supervisorId: supervisor2Id,
      fechaLlegada: schedLlegada,
      fechaSalida: schedSalida,
      arrivedAt: null,
      departedAt: null,
      status: StatusType.ACTIVO,
      operationalStatus: RecaladaOperativeStatus.SCHEDULED,
      terminal: "Terminal de Cruceros",
      muelle: "Muelle 2",
      pasajerosEstimados: 4300,
      tripulacionEstimada: 1500,
      observaciones: "[SEED] Recalada SCHEDULED (llega en ~2h). Upcoming garantizado.",
      fuente: RecaladaSource.MANUAL,
      canceledAt: null,
      cancelReason: null,
    },
    create: {
      codigoRecalada: recaladaScheduledCode,
      buqueId: buque2,
      paisOrigenId: paisIT,
      supervisorId: supervisor2Id,
      fechaLlegada: schedLlegada,
      fechaSalida: schedSalida,
      status: StatusType.ACTIVO,
      operationalStatus: RecaladaOperativeStatus.SCHEDULED,
      terminal: "Terminal de Cruceros",
      muelle: "Muelle 2",
      pasajerosEstimados: 4300,
      tripulacionEstimada: 1500,
      observaciones: "[SEED] Recalada SCHEDULED (llega en ~2h). Upcoming garantizado.",
      fuente: RecaladaSource.MANUAL,
    },
  })

  const rDeparted = await prisma.recalada.upsert({
    where: { codigoRecalada: recaladaDepartedCode },
    update: {
      buqueId: buque3,
      paisOrigenId: paisES,
      supervisorId: supervisor1Id,
      fechaLlegada: departedLlegada,
      fechaSalida: departedSalida,
      arrivedAt: departedArrivedAt,
      departedAt: departedDepartedAt,
      status: StatusType.ACTIVO,
      operationalStatus: RecaladaOperativeStatus.DEPARTED,
      terminal: "Terminal de Cruceros",
      muelle: "Muelle 3",
      pasajerosEstimados: 3900,
      tripulacionEstimada: 1350,
      observaciones: "[SEED] Recalada DEPARTED (histórica ayer).",
      fuente: RecaladaSource.MANUAL,
      canceledAt: null,
      cancelReason: null,
    },
    create: {
      codigoRecalada: recaladaDepartedCode,
      buqueId: buque3,
      paisOrigenId: paisES,
      supervisorId: supervisor1Id,
      fechaLlegada: departedLlegada,
      fechaSalida: departedSalida,
      arrivedAt: departedArrivedAt,
      departedAt: departedDepartedAt,
      status: StatusType.ACTIVO,
      operationalStatus: RecaladaOperativeStatus.DEPARTED,
      terminal: "Terminal de Cruceros",
      muelle: "Muelle 3",
      pasajerosEstimados: 3900,
      tripulacionEstimada: 1350,
      observaciones: "[SEED] Recalada DEPARTED (histórica ayer).",
      fuente: RecaladaSource.MANUAL,
    },
  })

  const rCanceled = await prisma.recalada.upsert({
    where: { codigoRecalada: recaladaCanceledCode },
    update: {
      buqueId: buque2,
      paisOrigenId: paisIT,
      supervisorId: supervisor2Id,
      fechaLlegada: canceledLlegada,
      fechaSalida: canceledSalida,
      arrivedAt: null,
      departedAt: null,
      status: StatusType.ACTIVO,
      operationalStatus: RecaladaOperativeStatus.CANCELED,
      terminal: "Terminal de Cruceros",
      muelle: "Muelle 2",
      pasajerosEstimados: 4100,
      tripulacionEstimada: 1400,
      observaciones: "[SEED] Recalada CANCELED (mañana).",
      fuente: RecaladaSource.MANUAL,
      canceledAt: now,
      cancelReason: "[SEED] Cancelación de ejemplo",
    },
    create: {
      codigoRecalada: recaladaCanceledCode,
      buqueId: buque2,
      paisOrigenId: paisIT,
      supervisorId: supervisor2Id,
      fechaLlegada: canceledLlegada,
      fechaSalida: canceledSalida,
      status: StatusType.ACTIVO,
      operationalStatus: RecaladaOperativeStatus.CANCELED,
      terminal: "Terminal de Cruceros",
      muelle: "Muelle 2",
      pasajerosEstimados: 4100,
      tripulacionEstimada: 1400,
      observaciones: "[SEED] Recalada CANCELED (mañana).",
      fuente: RecaladaSource.MANUAL,
      canceledAt: now,
      cancelReason: "[SEED] Cancelación de ejemplo",
    },
  })

  console.log("🧭 Recaladas seed ready (SCHEDULED/ARRIVED/DEPARTED/CANCELED)")

  // ==========================================================
  // ✅ ATENCIONES:
  // - 1 cerrada hoy temprano (histórico del día)
  // - 1 OPEN activa ahora (para GUIA activeTurno)
  // - 1 OPEN futura en ~2h (para upcoming supervisor)
  // - 1 OPEN asociada a la recalada scheduled (para “agenda”)
  // - 1 CANCELADA mañana (variedad)
  // ==========================================================

  // 1) Cerrada: hace 6h → hace 4h
  await upsertAtencionWithSlots({
    recaladaId: rArrived.id,
    supervisorId: supervisor1Id,
    createdById,
    descripcion: "[SEED] Atención CERRADA (hoy temprano)",
    fechaInicio: addMinutes(now, -360),
    fechaFin: addMinutes(now, -240),
    operationalStatus: AtencionOperativeStatus.CLOSED,
    turnosTotal: 4,
    slotPlan: [
      {
        numero: 1,
        status: TurnoStatus.COMPLETED,
        guiaId: guiaIds[0],
        checkInAt: addMinutes(now, -355),
        checkOutAt: addMinutes(now, -245),
      },
      {
        numero: 2,
        status: TurnoStatus.COMPLETED,
        guiaId: guiaIds[1],
        checkInAt: addMinutes(now, -350),
        checkOutAt: addMinutes(now, -250),
      },
      { numero: 3, status: TurnoStatus.NO_SHOW, guiaId: guiaIds[2] },
      {
        numero: 4,
        status: TurnoStatus.CANCELED,
        guiaId: null,
        canceledAt: addMinutes(now, -300),
        cancelReason: "[SEED] Cancelado de ejemplo",
      },
    ],
  })

  // 2) OPEN activa ahora: -30min → +90min
  await upsertAtencionWithSlots({
    recaladaId: rArrived.id,
    supervisorId: supervisor1Id,
    createdById,
    descripcion: "[SEED] Atención ABIERTA (activa ahora)",
    fechaInicio: addMinutes(now, -30),
    fechaFin: addMinutes(now, +90),
    operationalStatus: AtencionOperativeStatus.OPEN,
    turnosTotal: 6,
    slotPlan: [
      { numero: 1, status: TurnoStatus.IN_PROGRESS, guiaId: guiaIds[3], checkInAt: addMinutes(now, -25) },
      { numero: 2, status: TurnoStatus.ASSIGNED, guiaId: guiaIds[2] },
      { numero: 3, status: TurnoStatus.AVAILABLE, guiaId: null },
      { numero: 4, status: TurnoStatus.AVAILABLE, guiaId: null },
      { numero: 5, status: TurnoStatus.AVAILABLE, guiaId: null },
      { numero: 6, status: TurnoStatus.CANCELED, guiaId: null, canceledAt: addMinutes(now, -10), cancelReason: "[SEED] Cupo cancelado" },
    ],
  })

  // 3) OPEN futura (upcoming): +120min → +240min
  await upsertAtencionWithSlots({
    recaladaId: rArrived.id,
    supervisorId: supervisor1Id,
    createdById,
    descripcion: "[SEED] Atención ABIERTA (próxima en ~2h)",
    fechaInicio: addMinutes(now, +120),
    fechaFin: addMinutes(now, +240),
    operationalStatus: AtencionOperativeStatus.OPEN,
    turnosTotal: 3,
    slotPlan: [
      { numero: 1, status: TurnoStatus.AVAILABLE, guiaId: null },
      { numero: 2, status: TurnoStatus.AVAILABLE, guiaId: null },
      { numero: 3, status: TurnoStatus.AVAILABLE, guiaId: null },
    ],
  })

  // 4) OPEN asociada a recalada SCHEDULED: +150min → +330min
  await upsertAtencionWithSlots({
    recaladaId: rScheduled.id,
    supervisorId: supervisor2Id,
    createdById,
    descripcion: "[SEED] Atención (para recalada SCHEDULED)",
    fechaInicio: addMinutes(now, +150),
    fechaFin: addMinutes(now, +330),
    operationalStatus: AtencionOperativeStatus.OPEN,
    turnosTotal: 3,
    slotPlan: [
      { numero: 1, status: TurnoStatus.ASSIGNED, guiaId: guiaIds[0] },
      { numero: 2, status: TurnoStatus.AVAILABLE, guiaId: null },
      { numero: 3, status: TurnoStatus.AVAILABLE, guiaId: null },
    ],
  })

  // 5) CANCELADA mañana: +1d +60 → +1d +180
  await upsertAtencionWithSlots({
    recaladaId: rCanceled.id,
    supervisorId: supervisor2Id,
    createdById,
    descripcion: "[SEED] Atención CANCELADA (mañana)",
    fechaInicio: addMinutes(now, +24 * 60 + 60),
    fechaFin: addMinutes(now, +24 * 60 + 180),
    operationalStatus: AtencionOperativeStatus.CANCELED,
    turnosTotal: 2,
    slotPlan: [
      { numero: 1, status: TurnoStatus.CANCELED, guiaId: null, canceledAt: now, cancelReason: "[SEED] Atención cancelada" },
      { numero: 2, status: TurnoStatus.CANCELED, guiaId: null, canceledAt: now, cancelReason: "[SEED] Atención cancelada" },
    ],
    canceledAt: now,
    cancelReason: "[SEED] Cancelación de atención",
    canceledById: createdById,
  })

  console.log("🧩 Atenciones + Turnos seed ready (OPEN/CLOSED/CANCELED + estados de turnos)")
}

type SlotPlanItem = {
  numero: number
  status: TurnoStatus
  guiaId: string | null
  checkInAt?: Date
  checkOutAt?: Date
  canceledAt?: Date
  cancelReason?: string
}

type UpsertAtencionInput = {
  recaladaId: number
  supervisorId: string
  createdById: string
  descripcion: string
  fechaInicio: Date
  fechaFin: Date
  operationalStatus: AtencionOperativeStatus
  turnosTotal: number
  slotPlan: SlotPlanItem[]
  canceledAt?: Date
  cancelReason?: string
  canceledById?: string
}

async function upsertAtencionWithSlots(input: UpsertAtencionInput) {
  // Atencion no tiene un unique compuesto, así que la clave práctica es (recaladaId + fechaInicio + fechaFin)
  const existing = await prisma.atencion.findFirst({
    where: { recaladaId: input.recaladaId, fechaInicio: input.fechaInicio, fechaFin: input.fechaFin },
    select: { id: true },
  })

  const atencion = existing
    ? await prisma.atencion.update({
        where: { id: existing.id },
        data: {
          supervisorId: input.supervisorId,
          turnosTotal: input.turnosTotal,
          descripcion: input.descripcion,
          status: StatusType.ACTIVO,
          operationalStatus: input.operationalStatus,
          canceledAt: input.canceledAt ?? null,
          cancelReason: input.cancelReason ?? null,
          canceledById: input.canceledById ?? null,
        },
      })
    : await prisma.atencion.create({
        data: {
          recaladaId: input.recaladaId,
          supervisorId: input.supervisorId,
          turnosTotal: input.turnosTotal,
          descripcion: input.descripcion,
          fechaInicio: input.fechaInicio,
          fechaFin: input.fechaFin,
          status: StatusType.ACTIVO,
          operationalStatus: input.operationalStatus,
          createdById: input.createdById,
          canceledAt: input.canceledAt,
          cancelReason: input.cancelReason,
          canceledById: input.canceledById,
        },
      })

  await prisma.$transaction(async (tx) => {
    // 1) Ajusta slots 1..turnosTotal
    for (let n = 1; n <= input.turnosTotal; n++) {
      await tx.turno.upsert({
        where: { atencionId_numero: { atencionId: atencion.id, numero: n } },
        update: { fechaInicio: input.fechaInicio, fechaFin: input.fechaFin },
        create: {
          atencionId: atencion.id,
          numero: n,
          status: TurnoStatus.AVAILABLE,
          guiaId: null,
          fechaInicio: input.fechaInicio,
          fechaFin: input.fechaFin,
          createdById: input.createdById,
        },
      })
    }

    // 2) Aplica plan
    for (const p of input.slotPlan) {
      if (p.numero < 1 || p.numero > input.turnosTotal) continue

      const turno = await tx.turno.findUnique({
        where: { atencionId_numero: { atencionId: atencion.id, numero: p.numero } },
        select: { id: true },
      })
      if (!turno) continue

      await tx.turno.update({
        where: { id: turno.id },
        data: {
          status: p.status,
          guiaId: p.guiaId,
          checkInAt: p.checkInAt ?? null,
          checkOutAt: p.checkOutAt ?? null,
          canceledAt: p.canceledAt ?? null,
          cancelReason: p.cancelReason ?? null,
        },
      })
    }

    // 3) Si hay turnos > cupo, borrar solo si están libres
    const extras = await tx.turno.findMany({
      where: { atencionId: atencion.id, numero: { gt: input.turnosTotal } },
      select: { id: true, status: true, guiaId: true },
    })
    const toDelete = extras.filter((t) => t.status === TurnoStatus.AVAILABLE && !t.guiaId).map((t) => t.id)
    if (toDelete.length > 0) await tx.turno.deleteMany({ where: { id: { in: toDelete } } })
  })

  console.log(
    `🎫 Atencion seed ok id=${atencion.id} recaladaId=${input.recaladaId} status=${input.operationalStatus} cupo=${input.turnosTotal}`
  )
  return atencion
}

// 🔒 Pequeño helper para evitar TS raro si tu editor se pone quisquilloso
function RecaladaOperiveStatusFallback(s: RecaladaOperativeStatus) {
  return s
}

main()
  .catch((e) => {
    console.error("❌ Error during seeding:", e)
    ;(globalThis as any)?.process?.exit?.(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
