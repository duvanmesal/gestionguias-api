import {
  ProfileStatus,
  RolType,
  StatusType,
  TurnoAssignmentMode,
} from "@prisma/client"

import type { SeedContext } from "./context"
import { resolvePaisIdOrThrow, resolveUserIdOrThrow } from "./resolvers"
import { hashPassword } from "./security"

function normalizeShipCode(code: string) {
  return code.trim().toUpperCase()
}

export async function upsertBaseCatalogsAndConfig(context: SeedContext) {
  await upsertSuperAdmin(context)
  await upsertCountries(context)
  await upsertPortsAndDocks(context)
  await upsertShips(context)
  await fixShipsPaisIdIfNull(context)
  await upsertOperationalSlots(context)

  const superAdminId = await resolveUserIdOrThrow(context, context.superAdminEmail)
  await upsertOperationalConfig(context, superAdminId)
}

async function upsertOperationalSlots(context: SeedContext) {
  for (let numero = 1; numero <= 4; numero++) {
    await context.prisma.slotOperativo.upsert({
      where: { numero },
      update: { status: StatusType.ACTIVO, motivoInactividad: null },
      create: { numero, status: StatusType.ACTIVO },
    })
  }
  console.log("Operational slots upserted: 4")
}

async function upsertSuperAdmin(context: SeedContext) {
  const passwordHash = await hashPassword(context, context.superAdminPassword)

  await context.prisma.usuario.upsert({
    where: { email: context.superAdminEmail },
    update: {
      passwordHash,
      nombres: "Super",
      apellidos: "Admin",
      rol: RolType.SUPER_ADMIN,
      activo: true,
      profileStatus: ProfileStatus.COMPLETE,
      emailVerifiedAt: context.now,
    },
    create: {
      email: context.superAdminEmail,
      passwordHash,
      nombres: "Super",
      apellidos: "Admin",
      rol: RolType.SUPER_ADMIN,
      activo: true,
      profileStatus: ProfileStatus.COMPLETE,
      emailVerifiedAt: context.now,
    },
  })

  console.log(`SuperAdmin ready: ${context.superAdminEmail}`)
}

async function upsertCountries(context: SeedContext) {
  const countries = [
    { nombre: "Colombia", codigo: "CO" },
    { nombre: "Estados Unidos", codigo: "US" },
    { nombre: "España", codigo: "ES" },
    { nombre: "Italia", codigo: "IT" },
    { nombre: "Brasil", codigo: "BR" },
    { nombre: "Panamá", codigo: "PA" },
    { nombre: "México", codigo: "MX" },
    { nombre: "Reino Unido", codigo: "GB" },
    { nombre: "Francia", codigo: "FR" },
    { nombre: "Alemania", codigo: "DE" },
    { nombre: "Canadá", codigo: "CA" },
    { nombre: "Argentina", codigo: "AR" },
    { nombre: "Chile", codigo: "CL" },
    { nombre: "Perú", codigo: "PE" },
    { nombre: "Ecuador", codigo: "EC" },
    { nombre: "Uruguay", codigo: "UY" },
    { nombre: "Costa Rica", codigo: "CR" },
    { nombre: "República Dominicana", codigo: "DO" },
    { nombre: "Jamaica", codigo: "JM" },
    { nombre: "Bahamas", codigo: "BS" },
    { nombre: "Barbados", codigo: "BB" },
    { nombre: "Curaçao", codigo: "CW" },
    { nombre: "Aruba", codigo: "AW" },
    { nombre: "Trinidad y Tobago", codigo: "TT" },
    { nombre: "Grecia", codigo: "GR" },
    { nombre: "Portugal", codigo: "PT" },
    { nombre: "Noruega", codigo: "NO" },
    { nombre: "Dinamarca", codigo: "DK" },
    { nombre: "Países Bajos", codigo: "NL" },
    { nombre: "Bélgica", codigo: "BE" },
    { nombre: "Suecia", codigo: "SE" },
    { nombre: "Finlandia", codigo: "FI" },
    { nombre: "Irlanda", codigo: "IE" },
    { nombre: "Malta", codigo: "MT" },
    { nombre: "Croacia", codigo: "HR" },
    { nombre: "Turquía", codigo: "TR" },
    { nombre: "Marruecos", codigo: "MA" },
    { nombre: "Egipto", codigo: "EG" },
    { nombre: "Sudáfrica", codigo: "ZA" },
    { nombre: "Australia", codigo: "AU" },
    { nombre: "Nueva Zelanda", codigo: "NZ" },
    { nombre: "Japón", codigo: "JP" },
    { nombre: "China", codigo: "CN" },
    { nombre: "Singapur", codigo: "SG" },
    { nombre: "India", codigo: "IN" },
    { nombre: "Filipinas", codigo: "PH" },
    { nombre: "Corea del Sur", codigo: "KR" },
    { nombre: "Emiratos Árabes Unidos", codigo: "AE" },
  ]

  for (const country of countries) {
    await context.prisma.pais.upsert({
      where: { codigo: country.codigo },
      update: { nombre: country.nombre, status: StatusType.ACTIVO },
      create: { ...country, status: StatusType.ACTIVO },
    })
  }
  console.log(`Countries upserted: ${countries.length}`)
}

async function upsertPortsAndDocks(context: SeedContext) {
  const puertos = [
    {
      codigo: "CTG",
      nombre: "Puerto de Cartagena",
      ciudad: "Cartagena",
      codigoPais: "CO",
      muelles: [
        { codigo: "CTG-M1", nombre: "Muelle de Cruceros 1", capacidadCruceros: 2 },
        { codigo: "CTG-M2", nombre: "Muelle de Cruceros 2", capacidadCruceros: 2 },
        { codigo: "CTG-M3", nombre: "Muelle de Cruceros 3", capacidadCruceros: 1 },
        { codigo: "CTG-FIFO", nombre: "Muelle FIFO Operativo", capacidadCruceros: 1 },
      ],
    },
    {
      codigo: "SMR",
      nombre: "Puerto de Santa Marta",
      ciudad: "Santa Marta",
      codigoPais: "CO",
      muelles: [
        { codigo: "SMR-M1", nombre: "Muelle Internacional 1", capacidadCruceros: 1 },
        { codigo: "SMR-M2", nombre: "Muelle Internacional 2", capacidadCruceros: 1 },
      ],
    },
    {
      codigo: "BAQ",
      nombre: "Puerto de Barranquilla",
      ciudad: "Barranquilla",
      codigoPais: "CO",
      muelles: [
        { codigo: "BAQ-M1", nombre: "Muelle Fluvial Turístico", capacidadCruceros: 1 },
      ],
    },
    {
      codigo: "SPC",
      nombre: "Puerto de San Andrés",
      ciudad: "San Andrés",
      codigoPais: "CO",
      muelles: [
        { codigo: "SPC-M1", nombre: "Muelle Turístico San Andrés", capacidadCruceros: 1 },
      ],
    },
    {
      codigo: "BUN",
      nombre: "Puerto de Buenaventura",
      ciudad: "Buenaventura",
      codigoPais: "CO",
      muelles: [
        { codigo: "BUN-M1", nombre: "Muelle Pacífico Turístico", capacidadCruceros: 1 },
      ],
    },
  ]

  let muellesCount = 0
  for (const puertoSeed of puertos) {
    const paisId = await resolvePaisIdOrThrow(context, puertoSeed.codigoPais)
    const puerto = await context.prisma.puerto.upsert({
      where: { codigo: puertoSeed.codigo },
      update: {
        nombre: puertoSeed.nombre,
        ciudad: puertoSeed.ciudad,
        paisId,
        status: StatusType.ACTIVO,
      },
      create: {
        codigo: puertoSeed.codigo,
        nombre: puertoSeed.nombre,
        ciudad: puertoSeed.ciudad,
        paisId,
        status: StatusType.ACTIVO,
      },
    })

    for (const muelleSeed of puertoSeed.muelles) {
      await context.prisma.muelle.upsert({
        where: { codigo: muelleSeed.codigo },
        update: {
          nombre: muelleSeed.nombre,
          puertoId: puerto.id,
          capacidadCruceros: muelleSeed.capacidadCruceros,
          status: StatusType.ACTIVO,
        },
        create: {
          codigo: muelleSeed.codigo,
          nombre: muelleSeed.nombre,
          puertoId: puerto.id,
          capacidadCruceros: muelleSeed.capacidadCruceros,
          status: StatusType.ACTIVO,
        },
      })
      muellesCount++
    }
  }

  console.log(`Ports/docks upserted: ${puertos.length}/${muellesCount}`)
}

async function upsertShips(context: SeedContext) {
  const ships = [
    { codigo: "B-001", nombre: "Wonder of the Seas", naviera: "Royal Caribbean", capacidad: 7084, codigoPais: "US" },
    { codigo: "B-002", nombre: "MSC Meraviglia", naviera: "MSC Cruises", capacidad: 5714, codigoPais: "IT" },
    { codigo: "B-003", nombre: "Norwegian Epic", naviera: "Norwegian Cruise Line", capacidad: 5183, codigoPais: "US" },
    { codigo: "B-004", nombre: "Costa Fascinosa", naviera: "Costa Cruceros", capacidad: 3780, codigoPais: "IT" },
    { codigo: "B-005", nombre: "Celebrity Beyond", naviera: "Celebrity Cruises", capacidad: 3937, codigoPais: "US" },
    { codigo: "B-006", nombre: "Queen Mary 2", naviera: "Cunard Line", capacidad: 2695, codigoPais: "GB" },
    { codigo: "B-007", nombre: "AIDAperla", naviera: "AIDA Cruises", capacidad: 4350, codigoPais: "DE" },
    { codigo: "B-008", nombre: "Disney Dream", naviera: "Disney Cruise Line", capacidad: 4000, codigoPais: "US" },
    { codigo: "B-009", nombre: "Icon of the Seas", naviera: "Royal Caribbean", capacidad: 7600, codigoPais: "US" },
    { codigo: "B-010", nombre: "Utopia of the Seas", naviera: "Royal Caribbean", capacidad: 6688, codigoPais: "US" },
    { codigo: "B-011", nombre: "Symphony of the Seas", naviera: "Royal Caribbean", capacidad: 6680, codigoPais: "US" },
    { codigo: "B-012", nombre: "Harmony of the Seas", naviera: "Royal Caribbean", capacidad: 6687, codigoPais: "US" },
    { codigo: "B-013", nombre: "Oasis of the Seas", naviera: "Royal Caribbean", capacidad: 6780, codigoPais: "US" },
    { codigo: "B-014", nombre: "Allure of the Seas", naviera: "Royal Caribbean", capacidad: 6780, codigoPais: "US" },
    { codigo: "B-015", nombre: "Odyssey of the Seas", naviera: "Royal Caribbean", capacidad: 5510, codigoPais: "US" },
    { codigo: "B-016", nombre: "Spectrum of the Seas", naviera: "Royal Caribbean", capacidad: 5622, codigoPais: "US" },
    { codigo: "B-017", nombre: "MSC Seascape", naviera: "MSC Cruises", capacidad: 5877, codigoPais: "IT" },
    { codigo: "B-018", nombre: "MSC Seashore", naviera: "MSC Cruises", capacidad: 5877, codigoPais: "IT" },
    { codigo: "B-019", nombre: "MSC World Europa", naviera: "MSC Cruises", capacidad: 6762, codigoPais: "IT" },
    { codigo: "B-020", nombre: "MSC Grandiosa", naviera: "MSC Cruises", capacidad: 6334, codigoPais: "IT" },
    { codigo: "B-021", nombre: "MSC Virtuosa", naviera: "MSC Cruises", capacidad: 6334, codigoPais: "IT" },
    { codigo: "B-022", nombre: "MSC Divina", naviera: "MSC Cruises", capacidad: 4345, codigoPais: "IT" },
    { codigo: "B-023", nombre: "Norwegian Prima", naviera: "Norwegian Cruise Line", capacidad: 3215, codigoPais: "US" },
    { codigo: "B-024", nombre: "Norwegian Viva", naviera: "Norwegian Cruise Line", capacidad: 3215, codigoPais: "US" },
    { codigo: "B-025", nombre: "Norwegian Encore", naviera: "Norwegian Cruise Line", capacidad: 3998, codigoPais: "US" },
    { codigo: "B-026", nombre: "Norwegian Bliss", naviera: "Norwegian Cruise Line", capacidad: 4004, codigoPais: "US" },
    { codigo: "B-027", nombre: "Norwegian Escape", naviera: "Norwegian Cruise Line", capacidad: 4266, codigoPais: "US" },
    { codigo: "B-028", nombre: "Celebrity Apex", naviera: "Celebrity Cruises", capacidad: 3405, codigoPais: "US" },
    { codigo: "B-029", nombre: "Celebrity Edge", naviera: "Celebrity Cruises", capacidad: 3373, codigoPais: "US" },
    { codigo: "B-030", nombre: "Celebrity Ascent", naviera: "Celebrity Cruises", capacidad: 3260, codigoPais: "US" },
    { codigo: "B-031", nombre: "Celebrity Reflection", naviera: "Celebrity Cruises", capacidad: 3046, codigoPais: "US" },
    { codigo: "B-032", nombre: "Carnival Celebration", naviera: "Carnival Cruise Line", capacidad: 5374, codigoPais: "US" },
    { codigo: "B-033", nombre: "Carnival Mardi Gras", naviera: "Carnival Cruise Line", capacidad: 5282, codigoPais: "US" },
    { codigo: "B-034", nombre: "Carnival Vista", naviera: "Carnival Cruise Line", capacidad: 3934, codigoPais: "US" },
    { codigo: "B-035", nombre: "Carnival Horizon", naviera: "Carnival Cruise Line", capacidad: 3960, codigoPais: "US" },
    { codigo: "B-036", nombre: "Carnival Panorama", naviera: "Carnival Cruise Line", capacidad: 4008, codigoPais: "US" },
    { codigo: "B-037", nombre: "Sky Princess", naviera: "Princess Cruises", capacidad: 3660, codigoPais: "US" },
    { codigo: "B-038", nombre: "Enchanted Princess", naviera: "Princess Cruises", capacidad: 3660, codigoPais: "US" },
    { codigo: "B-039", nombre: "Discovery Princess", naviera: "Princess Cruises", capacidad: 3660, codigoPais: "US" },
    { codigo: "B-040", nombre: "Regal Princess", naviera: "Princess Cruises", capacidad: 3560, codigoPais: "US" },
    { codigo: "B-041", nombre: "Koningsdam", naviera: "Holland America Line", capacidad: 2650, codigoPais: "NL" },
    { codigo: "B-042", nombre: "Nieuw Statendam", naviera: "Holland America Line", capacidad: 2666, codigoPais: "NL" },
    { codigo: "B-043", nombre: "Rotterdam", naviera: "Holland America Line", capacidad: 2668, codigoPais: "NL" },
    { codigo: "B-044", nombre: "Disney Wish", naviera: "Disney Cruise Line", capacidad: 4000, codigoPais: "US" },
    { codigo: "B-045", nombre: "Disney Fantasy", naviera: "Disney Cruise Line", capacidad: 4000, codigoPais: "US" },
    { codigo: "B-046", nombre: "Disney Magic", naviera: "Disney Cruise Line", capacidad: 2713, codigoPais: "US" },
    { codigo: "B-047", nombre: "Queen Anne", naviera: "Cunard Line", capacidad: 2996, codigoPais: "GB" },
    { codigo: "B-048", nombre: "Queen Victoria", naviera: "Cunard Line", capacidad: 2081, codigoPais: "GB" },
    { codigo: "B-049", nombre: "Costa Toscana", naviera: "Costa Cruceros", capacidad: 6554, codigoPais: "IT" },
    { codigo: "B-050", nombre: "Costa Smeralda", naviera: "Costa Cruceros", capacidad: 6554, codigoPais: "IT" },
    { codigo: "B-051", nombre: "Costa Diadema", naviera: "Costa Cruceros", capacidad: 4947, codigoPais: "IT" },
    { codigo: "B-052", nombre: "AIDAnova", naviera: "AIDA Cruises", capacidad: 6600, codigoPais: "DE" },
    { codigo: "B-053", nombre: "AIDAcosma", naviera: "AIDA Cruises", capacidad: 6547, codigoPais: "DE" },
    { codigo: "B-054", nombre: "Marella Explorer", naviera: "Marella Cruises", capacidad: 1924, codigoPais: "GB" },
    { codigo: "B-055", nombre: "Marella Discovery", naviera: "Marella Cruises", capacidad: 1830, codigoPais: "GB" },
    { codigo: "B-056", nombre: "Mein Schiff 1", naviera: "TUI Cruises", capacidad: 2894, codigoPais: "DE" },
    { codigo: "B-057", nombre: "Mein Schiff 2", naviera: "TUI Cruises", capacidad: 2894, codigoPais: "DE" },
    { codigo: "B-058", nombre: "Azamara Quest", naviera: "Azamara", capacidad: 694, codigoPais: "US" },
    { codigo: "B-059", nombre: "Azamara Journey", naviera: "Azamara", capacidad: 694, codigoPais: "US" },
    { codigo: "B-060", nombre: "Oceania Vista", naviera: "Oceania Cruises", capacidad: 1200, codigoPais: "US" },
    { codigo: "B-061", nombre: "Oceania Marina", naviera: "Oceania Cruises", capacidad: 1250, codigoPais: "US" },
    { codigo: "B-062", nombre: "Seven Seas Splendor", naviera: "Regent Seven Seas Cruises", capacidad: 746, codigoPais: "US" },
    { codigo: "B-063", nombre: "Seven Seas Explorer", naviera: "Regent Seven Seas Cruises", capacidad: 746, codigoPais: "US" },
    { codigo: "B-064", nombre: "Silver Moon", naviera: "Silversea Cruises", capacidad: 596, codigoPais: "IT" },
    { codigo: "B-065", nombre: "Silver Nova", naviera: "Silversea Cruises", capacidad: 728, codigoPais: "IT" },
    { codigo: "B-066", nombre: "Viking Star", naviera: "Viking Ocean Cruises", capacidad: 930, codigoPais: "NO" },
    { codigo: "B-067", nombre: "Viking Sea", naviera: "Viking Ocean Cruises", capacidad: 930, codigoPais: "NO" },
    { codigo: "B-068", nombre: "Explora I", naviera: "Explora Journeys", capacidad: 922, codigoPais: "IT" },
    { codigo: "B-069", nombre: "Explora II", naviera: "Explora Journeys", capacidad: 922, codigoPais: "IT" },
    { codigo: "B-070", nombre: "Star Clipper", naviera: "Star Clippers", capacidad: 166, codigoPais: "MT" },
  ]

  for (const ship of ships) {
    const paisId = await resolvePaisIdOrThrow(context, ship.codigoPais)
    await context.prisma.buque.upsert({
      where: { nombre: ship.nombre },
      update: {
        codigo: normalizeShipCode(ship.codigo),
        naviera: ship.naviera,
        capacidad: ship.capacidad,
        paisId,
        status: StatusType.ACTIVO,
      },
      create: {
        codigo: normalizeShipCode(ship.codigo),
        nombre: ship.nombre,
        naviera: ship.naviera,
        capacidad: ship.capacidad,
        paisId,
        status: StatusType.ACTIVO,
      },
    })
  }

  console.log(`Ships upserted: ${ships.length}`)
}

async function fixShipsPaisIdIfNull(context: SeedContext) {
  const grupos = await context.prisma.recalada.groupBy({
    by: ["buqueId", "paisOrigenId"],
    _count: { _all: true },
  })

  const bestByBuque: Record<number, { paisOrigenId: number; count: number }> = {}
  for (const grupo of grupos) {
    const current = bestByBuque[grupo.buqueId]
    if (!current || grupo._count._all > current.count) {
      bestByBuque[grupo.buqueId] = { paisOrigenId: grupo.paisOrigenId, count: grupo._count._all }
    }
  }

  const nullShips = await context.prisma.buque.findMany({
    where: { paisId: null },
    select: { id: true },
  })

  for (const ship of nullShips) {
    const best = bestByBuque[ship.id]
    if (best?.paisOrigenId) {
      await context.prisma.buque.update({
        where: { id: ship.id },
        data: { paisId: best.paisOrigenId },
      })
    }
  }

  const defaultPais = await context.prisma.pais.findUnique({ where: { codigo: "CO" } })
  if (!defaultPais) throw new Error("No existe país por defecto con codigo=CO")

  await context.prisma.buque.updateMany({
    where: { paisId: null },
    data: { paisId: defaultPais.id },
  })
}

async function upsertOperationalConfig(context: SeedContext, actorUserId: string) {
  const config = await context.prisma.operationalConfig.upsert({
    where: { id: "global" },
    update: {
      turnoAssignmentMode: TurnoAssignmentMode.MANUAL_RECLAMO,
      updatedById: actorUserId,
    },
    create: {
      id: "global",
      turnoAssignmentMode: TurnoAssignmentMode.MANUAL_RECLAMO,
      updatedById: actorUserId,
    },
  })

  console.log(`Operational config ready: ${config.turnoAssignmentMode}`)
}
