import {
  AtencionEvaluationEstadoFinal,
  AtencionOperativeStatus,
  NotificationChannel,
  NotificationStatus,
  NotificationType,
  Prisma,
  RecaladaOperativeStatus,
  RecaladaSource,
  StatusType,
  TurnoStatus,
} from "@prisma/client"

import type { SeedContext } from "./context"
import type { DemoUsers, SeedUserRef } from "./users"
import { upsertDemoUsers } from "./users"
import {
  resolveMuelleIdOrThrow,
  resolvePuertoIdOrThrow,
  resolveUserIdOrThrow,
} from "./resolvers"
import { addDays, addMinutes, dayStartBogota, timeOnBogotaDay, ymdBogota } from "./time"

type CatalogRefs = {
  buqueIds: number[]
  paisIds: number[]
  puertoCartagenaId: number
  muelleIds: number[]
  muelleFifoId: number
}

type SlotPlanItem = {
  numero: number
  status: TurnoStatus
  guiaId: string | null
  checkInAt?: Date
  checkOutAt?: Date
  checkInRequestedAt?: Date
  checkInConfirmedAt?: Date
  checkInConfirmedById?: string
  checkInRejectedAt?: Date
  checkInRejectedById?: string
  checkInRejectReason?: string
  canceledAt?: Date
  cancelReason?: string
  observaciones?: string
}

type CreatedAtencion = {
  id: number
  operationalStatus: AtencionOperativeStatus
  fechaInicio: Date
  fechaFin: Date
  noShowTurnoId?: number
  pendingCheckInTurnoId?: number
  rejectedCheckInTurnoId?: number
}

type ScenarioRefs = {
  pendingCheckInTurnoIds: number[]
  noShowTurnoIds: number[]
  upcomingAtencionIds: number[]
  activeAtencionId: number | null
}

export async function seedOperationalDemo(context: SeedContext) {
  console.log("Seeding operational demo data (60-day dashboard dataset)...")

  const users = await upsertDemoUsers(context)
  assertDemoUsers(users)

  const createdById = await resolveUserIdOrThrow(context, context.superAdminEmail)
  const catalogs = await resolveCatalogRefs(context)

  await seedGuideAvailabilityStates(context, users.guides)

  const scenarioRefs = await seedCalendarDataset({
    context,
    users,
    catalogs,
    createdById,
  })

  await seedSpecialOperationalScenarios({
    context,
    users,
    catalogs,
    createdById,
    refs: scenarioRefs,
  })

  await seedOperationalNotifications({
    context,
    users,
    refs: scenarioRefs,
  })

  console.log("Operational demo seed ready: 60 days, dashboard analytics, FIFO, check-in and penalties")
}

function assertDemoUsers(users: DemoUsers) {
  if (users.supervisors.length < 3) throw new Error("Seed requires at least 3 demo supervisors")
  if (users.guides.length < 10) throw new Error("Seed requires at least 10 demo guides")
  for (const guide of users.guides) {
    if (!guide.guiaId) throw new Error(`Seed guide missing guiaId: ${guide.email}`)
  }
  for (const supervisor of users.supervisors) {
    if (!supervisor.supervisorId) throw new Error(`Seed supervisor missing supervisorId: ${supervisor.email}`)
  }
}

async function resolveCatalogRefs(context: SeedContext): Promise<CatalogRefs> {
  const muelleCodes = ["CTG-M1", "CTG-M2", "CTG-M3"]
  const [buques, paises] = await Promise.all([
    context.prisma.buque.findMany({
      where: { status: StatusType.ACTIVO },
      orderBy: { codigo: "asc" },
      select: { id: true },
    }),
    context.prisma.pais.findMany({
      where: { status: StatusType.ACTIVO },
      orderBy: { codigo: "asc" },
      select: { id: true },
    }),
  ])

  if (buques.length < 8) throw new Error("Seed requires at least 8 active ships")
  if (paises.length < 9) throw new Error("Seed requires at least 9 active countries")

  return {
    buqueIds: buques.map((buque) => buque.id),
    paisIds: paises.map((pais) => pais.id),
    puertoCartagenaId: await resolvePuertoIdOrThrow(context, "CTG"),
    muelleIds: await Promise.all(muelleCodes.map((code) => resolveMuelleIdOrThrow(context, code))),
    muelleFifoId: await resolveMuelleIdOrThrow(context, "CTG-FIFO"),
  }
}

async function seedGuideAvailabilityStates(context: SeedContext, guides: SeedUserRef[]) {
  const now = context.now
  const states = guides.map((guide, index) => {
    if (!guide.guiaId) throw new Error(`Guide without guiaId: ${guide.email}`)
    return {
      guiaId: guide.guiaId,
      disponibleParaTurnos: index < 6,
      disponibilidadUpdatedAt: index < 6 ? addMinutes(now, -80 + index * 8) : null,
      pendingPenalty: index === 2 || index === 8,
    }
  })

  for (const state of states) {
    await context.prisma.guia.update({
      where: { id: state.guiaId },
      data: {
        disponibleParaTurnos: state.disponibleParaTurnos,
        disponibilidadUpdatedAt: state.disponibilidadUpdatedAt,
        pendingPenalty: state.pendingPenalty,
      },
    })
  }

  console.log("Global guide availability ready")
}

async function seedCalendarDataset(args: {
  context: SeedContext
  users: DemoUsers
  catalogs: CatalogRefs
  createdById: string
}): Promise<ScenarioRefs> {
  const { context, users, catalogs, createdById } = args
  const startToday = dayStartBogota(context.now)
  const refs: ScenarioRefs = {
    pendingCheckInTurnoIds: [],
    noShowTurnoIds: [],
    upcomingAtencionIds: [],
    activeAtencionId: null,
  }

  let recaladaCount = 0
  let atencionCount = 0
  let turnoCount = 0
  let shipCursor = 0

  for (let dayOffset = -45; dayOffset <= 14; dayOffset++) {
    const day = addDays(startToday, dayOffset)
    const dayKey = ymdBogota(day)
    const recaladasForDay = 1

    for (let recaladaIndex = 0; recaladaIndex < recaladasForDay; recaladaIndex++) {
      const arrival = timeOnBogotaDay(day, 7 + recaladaIndex * 5 + positiveModulo(dayOffset, 3), recaladaIndex * 10)
      const departure = addMinutes(arrival, 7 * 60 + positiveModulo(dayOffset + recaladaIndex, 4) * 45)
      const recaladaStatus = getRecaladaStatus(dayOffset, recaladaIndex)
      const buqueId = getNextUniqueShipId(catalogs, shipCursor++)

      const recalada = await context.prisma.recalada.create({
        data: {
          codigoRecalada: `SEED-R-${dayKey}-${recaladaIndex + 1}`,
          buqueId,
          paisOrigenId: pick(catalogs.paisIds, dayOffset + recaladaIndex * 2),
          supervisorId: pickSupervisor(users, dayOffset + recaladaIndex).supervisorId as string,
          puertoId: catalogs.puertoCartagenaId,
          muelleId: pick(catalogs.muelleIds, dayOffset + recaladaIndex),
          fechaLlegada: arrival,
          fechaSalida: departure,
          arrivedAt: recaladaStatus === RecaladaOperativeStatus.ARRIVED || recaladaStatus === RecaladaOperativeStatus.DEPARTED ? addMinutes(arrival, 12) : null,
          departedAt: recaladaStatus === RecaladaOperativeStatus.DEPARTED ? addMinutes(departure, -8) : null,
          status: StatusType.ACTIVO,
          operationalStatus: recaladaStatus,
          terminal: "Terminal de Cruceros",
          muelle: `Muelle demo ${recaladaIndex + 1}`,
          pasajerosEstimados: 2200 + positiveModulo(dayOffset * 317 + recaladaIndex * 911, 4600),
          tripulacionEstimada: 800 + positiveModulo(dayOffset * 97 + recaladaIndex * 151, 1400),
          observaciones: `[SEED] Recalada demo ${dayKey} estado=${recaladaStatus}`,
          fuente: RecaladaSource.MANUAL,
          canceledAt: recaladaStatus === RecaladaOperativeStatus.CANCELED ? addMinutes(arrival, -24 * 60) : null,
          cancelReason: recaladaStatus === RecaladaOperativeStatus.CANCELED ? "[SEED] Cancelación preventiva por itinerario" : null,
        },
      })
      recaladaCount++

      const atencionesForRecalada = recaladaStatus === RecaladaOperativeStatus.CANCELED ? 1 : 1 + positiveModulo(dayOffset + recaladaIndex, 3)
      for (let atencionIndex = 0; atencionIndex < atencionesForRecalada; atencionIndex++) {
        const start = addMinutes(arrival, 45 + atencionIndex * 135)
        const end = addMinutes(start, 105 + positiveModulo(atencionIndex + dayOffset, 3) * 15)
        const atencionStatus = getAtencionStatus(dayOffset, recaladaStatus, atencionIndex)
        const slotsTotal = 3 + positiveModulo(dayOffset + atencionIndex + recaladaIndex, 5)
        const slotPlan = buildSlotPlan({
          context,
          users,
          dayOffset,
          atencionIndex,
          slotsTotal,
          fechaInicio: start,
          fechaFin: end,
          operationalStatus: atencionStatus,
          supervisorUserId: pickSupervisor(users, dayOffset + recaladaIndex).userId,
        })

        const atencion = await createAtencionWithSlots({
          context,
          recaladaId: recalada.id,
          supervisorId: pickSupervisor(users, dayOffset + recaladaIndex).supervisorId as string,
          createdById,
          descripcion: `[SEED] Atención demo ${dayKey}-${recaladaIndex + 1}-${atencionIndex + 1}`,
          fechaInicio: start,
          fechaFin: end,
          operationalStatus: atencionStatus,
          turnosTotal: slotsTotal,
          slotPlan,
          canceledAt: atencionStatus === AtencionOperativeStatus.CANCELED ? addMinutes(start, -60) : undefined,
          cancelReason: atencionStatus === AtencionOperativeStatus.CANCELED ? "[SEED] Atención cancelada por baja demanda" : undefined,
          canceledById: atencionStatus === AtencionOperativeStatus.CANCELED ? createdById : undefined,
        })

        atencionCount++
        turnoCount += slotsTotal
        collectScenarioRefs(refs, atencion)

        if (atencionStatus === AtencionOperativeStatus.CLOSED) {
          await upsertAtencionEvaluationForSeed({
            context,
            atencionId: atencion.id,
            evaluatedById: createdById,
            dayOffset,
            atencionIndex,
          })
        }

        if (atencion.noShowTurnoId) {
          await upsertPenaltyForSeed({
            context,
            guiaId: pickGuide(users, dayOffset + atencionIndex + 2).guiaId as string,
            turnoId: atencion.noShowTurnoId,
            createdById,
            startsAt: addMinutes(end, -15),
            expiresAt: dayOffset >= -2 ? addMinutes(context.now, 48 * 60) : addMinutes(end, 48 * 60),
            reason: `[SEED] No se presentó al turno asignado en ${dayKey}.`,
          })
        }

        if (atencionStatus === AtencionOperativeStatus.OPEN && end > context.now) {
          refs.upcomingAtencionIds.push(atencion.id)
          await seedDisponibilidadesForAtencion({
            context,
            atencionId: atencion.id,
            rows: buildDisponibilidadRows(users, start, dayOffset + atencionIndex),
          })
        }
      }
    }
  }

  console.log(`Calendar demo ready: ${recaladaCount} recaladas, ${atencionCount} atenciones, ${turnoCount} turnos`)
  return refs
}

async function seedSpecialOperationalScenarios(args: {
  context: SeedContext
  users: DemoUsers
  catalogs: CatalogRefs
  createdById: string
  refs: ScenarioRefs
}) {
  const { context, users, catalogs, createdById, refs } = args
  const today = dayStartBogota(context.now)
  const dayKey = ymdBogota(today)
  const supervisor = users.supervisors[0]

  const arrived = await context.prisma.recalada.create({
    data: {
      codigoRecalada: `SEED-TODAY-ACTIVE-${dayKey}`,
      buqueId: getNextUniqueShipId(catalogs, 60),
      paisOrigenId: catalogs.paisIds[0],
      supervisorId: supervisor.supervisorId as string,
      puertoId: catalogs.puertoCartagenaId,
      muelleId: catalogs.muelleIds[0],
      fechaLlegada: addMinutes(context.now, -180),
      fechaSalida: addMinutes(context.now, 180),
      arrivedAt: addMinutes(context.now, -165),
      status: StatusType.ACTIVO,
      operationalStatus: RecaladaOperativeStatus.ARRIVED,
      terminal: "Terminal de Cruceros",
      muelle: "Muelle 1",
      pasajerosEstimados: 5200,
      tripulacionEstimada: 1900,
      observaciones: "[SEED] Escenario QA: recalada activa hoy con atención en curso y check-in pendiente.",
      fuente: RecaladaSource.MANUAL,
    },
  })

  const active = await createAtencionWithSlots({
    context,
    recaladaId: arrived.id,
    supervisorId: supervisor.supervisorId as string,
    createdById,
    descripcion: "[SEED] QA activa ahora: check-in pendiente, confirmado y rechazado",
    fechaInicio: addMinutes(context.now, -45),
    fechaFin: addMinutes(context.now, 100),
    operationalStatus: AtencionOperativeStatus.OPEN,
    turnosTotal: 6,
    slotPlan: [
      {
        numero: 1,
        status: TurnoStatus.IN_PROGRESS,
        guiaId: users.guides[0].guiaId as string,
        checkInRequestedAt: addMinutes(context.now, -42),
        checkInConfirmedAt: addMinutes(context.now, -35),
        checkInConfirmedById: supervisor.userId,
        checkInAt: addMinutes(context.now, -35),
      },
      {
        numero: 2,
        status: TurnoStatus.ASSIGNED,
        guiaId: users.guides[1].guiaId as string,
        checkInRequestedAt: addMinutes(context.now, -8),
      },
      {
        numero: 3,
        status: TurnoStatus.ASSIGNED,
        guiaId: users.guides[2].guiaId as string,
        checkInRequestedAt: addMinutes(context.now, -12),
      },
      {
        numero: 4,
        status: TurnoStatus.ASSIGNED,
        guiaId: users.guides[3].guiaId as string,
        checkInRequestedAt: addMinutes(context.now, -65),
        checkInRejectedAt: addMinutes(context.now, -52),
        checkInRejectedById: supervisor.userId,
        checkInRejectReason: "[SEED] Documento no validado en muelle.",
      },
      { numero: 5, status: TurnoStatus.AVAILABLE, guiaId: null },
      { numero: 6, status: TurnoStatus.CANCELED, guiaId: null, canceledAt: addMinutes(context.now, -20), cancelReason: "[SEED] Cupo cancelado" },
    ],
  })
  refs.activeAtencionId = active.id
  collectScenarioRefs(refs, active)
  await seedDisponibilidadesForAtencion({
    context,
    atencionId: active.id,
    rows: buildDisponibilidadRows(users, addMinutes(context.now, -80), 3),
  })

  const fifo = await context.prisma.recalada.create({
    data: {
      codigoRecalada: `FIFO-${dayKey}`,
      buqueId: getNextUniqueShipId(catalogs, 61),
      paisOrigenId: catalogs.paisIds[1],
      supervisorId: supervisor.supervisorId as string,
      puertoId: catalogs.puertoCartagenaId,
      muelleId: catalogs.muelleFifoId,
      fechaLlegada: addMinutes(context.now, 360),
      fechaSalida: addMinutes(context.now, 600),
      status: StatusType.ACTIVO,
      operationalStatus: RecaladaOperativeStatus.SCHEDULED,
      terminal: "Terminal de Cruceros",
      muelle: "Muelle FIFO",
      pasajerosEstimados: 3200,
      tripulacionEstimada: 1100,
      observaciones: "[SEED] FIFO: cambiar modo a FIFO_GLOBAL y marcar arribo para probar asignación por disponibilidad global.",
      fuente: RecaladaSource.MANUAL,
    },
  })

  const fifoAtencion = await createAtencionWithSlots({
    context,
    recaladaId: fifo.id,
    supervisorId: supervisor.supervisorId as string,
    createdById,
    descripcion: "[SEED] FIFO: 5 cupos disponibles para asignación global",
    fechaInicio: addMinutes(context.now, 360),
    fechaFin: addMinutes(context.now, 500),
    operationalStatus: AtencionOperativeStatus.OPEN,
    turnosTotal: 5,
    slotPlan: [
      { numero: 1, status: TurnoStatus.AVAILABLE, guiaId: null },
      { numero: 2, status: TurnoStatus.AVAILABLE, guiaId: null },
      { numero: 3, status: TurnoStatus.AVAILABLE, guiaId: null },
      { numero: 4, status: TurnoStatus.AVAILABLE, guiaId: null },
      { numero: 5, status: TurnoStatus.AVAILABLE, guiaId: null },
    ],
  })
  refs.upcomingAtencionIds.push(fifoAtencion.id)
  await seedDisponibilidadesForAtencion({
    context,
    atencionId: fifoAtencion.id,
    rows: [
      { guiaId: users.guides[0].guiaId as string, marcadoAt: addMinutes(context.now, -55), penalizado: false },
      { guiaId: users.guides[1].guiaId as string, marcadoAt: addMinutes(context.now, -45), penalizado: false },
      { guiaId: users.guides[2].guiaId as string, marcadoAt: addMinutes(context.now, -35), penalizado: true },
      { guiaId: users.guides[4].guiaId as string, marcadoAt: addMinutes(context.now, -25), penalizado: false },
    ],
  })

  console.log("Special QA scenarios ready: active check-in and FIFO")
}

async function createAtencionWithSlots(input: {
  context: SeedContext
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
}): Promise<CreatedAtencion> {
  const atencion = await input.context.prisma.atencion.create({
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

  const created: CreatedAtencion = {
    id: atencion.id,
    operationalStatus: input.operationalStatus,
    fechaInicio: input.fechaInicio,
    fechaFin: input.fechaFin,
  }

  for (const slot of input.slotPlan) {
    const turno = await input.context.prisma.turno.create({
      data: {
        atencionId: atencion.id,
        numero: slot.numero,
        status: slot.status,
        guiaId: slot.guiaId,
        fechaInicio: input.fechaInicio,
        fechaFin: input.fechaFin,
        checkInAt: slot.checkInAt,
        checkOutAt: slot.checkOutAt,
        checkInRequestedAt: slot.checkInRequestedAt,
        checkInConfirmedAt: slot.checkInConfirmedAt,
        checkInConfirmedById: slot.checkInConfirmedById,
        checkInRejectedAt: slot.checkInRejectedAt,
        checkInRejectedById: slot.checkInRejectedById,
        checkInRejectReason: slot.checkInRejectReason,
        canceledAt: slot.canceledAt,
        cancelReason: slot.cancelReason,
        observaciones: slot.observaciones,
        createdById: input.createdById,
      },
    })

    if (slot.status === TurnoStatus.NO_SHOW) created.noShowTurnoId = turno.id
    if (slot.checkInRequestedAt && !slot.checkInConfirmedAt && !slot.checkInRejectedAt) {
      created.pendingCheckInTurnoId = turno.id
    }
    if (slot.checkInRejectedAt) created.rejectedCheckInTurnoId = turno.id
  }

  return created
}

function buildSlotPlan(input: {
  context: SeedContext
  users: DemoUsers
  dayOffset: number
  atencionIndex: number
  slotsTotal: number
  fechaInicio: Date
  fechaFin: Date
  operationalStatus: AtencionOperativeStatus
  supervisorUserId: string
}): SlotPlanItem[] {
  const slots: SlotPlanItem[] = []
  const assignedGuideIndexes = new Set<number>()

  for (let numero = 1; numero <= input.slotsTotal; numero++) {
    const guiaIndex = positiveModulo(input.dayOffset + input.atencionIndex + numero, input.users.guides.length)
    const guia = input.users.guides[guiaIndex]
    const markGuide = () => {
      if (assignedGuideIndexes.has(guiaIndex)) return null
      assignedGuideIndexes.add(guiaIndex)
      return guia.guiaId as string
    }

    if (input.operationalStatus === AtencionOperativeStatus.CANCELED) {
      slots.push({
        numero,
        status: TurnoStatus.CANCELED,
        guiaId: null,
        canceledAt: addMinutes(input.fechaInicio, -60),
        cancelReason: "[SEED] Atención cancelada",
      })
      continue
    }

    if (input.operationalStatus === AtencionOperativeStatus.CLOSED) {
      if (numero === input.slotsTotal && positiveModulo(input.dayOffset + input.atencionIndex, 5) === 0) {
        slots.push({ numero, status: TurnoStatus.CANCELED, guiaId: null, canceledAt: addMinutes(input.fechaInicio, 20), cancelReason: "[SEED] Cupo cancelado" })
      } else if (numero === 2 && positiveModulo(input.dayOffset + input.atencionIndex, 6) === 0) {
        slots.push({ numero, status: TurnoStatus.NO_SHOW, guiaId: markGuide() })
      } else {
        const checkIn = addMinutes(input.fechaInicio, -5 + numero)
        slots.push({
          numero,
          status: TurnoStatus.COMPLETED,
          guiaId: markGuide(),
          checkInRequestedAt: addMinutes(checkIn, -8),
          checkInConfirmedAt: addMinutes(checkIn, -3),
          checkInConfirmedById: input.supervisorUserId,
          checkInAt: checkIn,
          checkOutAt: addMinutes(input.fechaFin, -5),
        })
      }
      continue
    }

    if (input.fechaInicio <= input.context.now && input.fechaFin > input.context.now) {
      if (numero === 1) {
        const checkIn = addMinutes(input.context.now, -25)
        slots.push({
          numero,
          status: TurnoStatus.IN_PROGRESS,
          guiaId: markGuide(),
          checkInRequestedAt: addMinutes(checkIn, -7),
          checkInConfirmedAt: addMinutes(checkIn, -2),
          checkInConfirmedById: input.supervisorUserId,
          checkInAt: checkIn,
        })
      } else if (numero === 2) {
        slots.push({
          numero,
          status: TurnoStatus.ASSIGNED,
          guiaId: markGuide(),
          checkInRequestedAt: addMinutes(input.context.now, -18),
        })
      } else {
        slots.push({ numero, status: TurnoStatus.AVAILABLE, guiaId: null })
      }
      continue
    }

    if (numero <= 2 && positiveModulo(input.dayOffset + numero, 3) !== 0) {
      slots.push({ numero, status: TurnoStatus.ASSIGNED, guiaId: markGuide() })
    } else {
      slots.push({ numero, status: TurnoStatus.AVAILABLE, guiaId: null })
    }
  }

  return slots
}

function getRecaladaStatus(dayOffset: number, recaladaIndex: number) {
  if (positiveModulo(dayOffset + recaladaIndex, 17) === 0) return RecaladaOperativeStatus.CANCELED
  if (dayOffset < 0) return RecaladaOperativeStatus.DEPARTED
  if (dayOffset === 0) return recaladaIndex === 0 ? RecaladaOperativeStatus.ARRIVED : RecaladaOperativeStatus.SCHEDULED
  return RecaladaOperativeStatus.SCHEDULED
}

function getAtencionStatus(
  dayOffset: number,
  recaladaStatus: RecaladaOperativeStatus,
  atencionIndex: number,
) {
  if (recaladaStatus === RecaladaOperativeStatus.CANCELED) return AtencionOperativeStatus.CANCELED
  if (dayOffset < 0) return AtencionOperativeStatus.CLOSED
  if (dayOffset === 0 && atencionIndex === 0) return AtencionOperativeStatus.OPEN
  return AtencionOperativeStatus.OPEN
}

function collectScenarioRefs(refs: ScenarioRefs, atencion: CreatedAtencion) {
  if (atencion.pendingCheckInTurnoId) {
    refs.pendingCheckInTurnoIds.push(atencion.pendingCheckInTurnoId)
  }
  if (atencion.noShowTurnoId) refs.noShowTurnoIds.push(atencion.noShowTurnoId)
}

async function upsertAtencionEvaluationForSeed(input: {
  context: SeedContext
  atencionId: number
  evaluatedById: string
  dayOffset: number
  atencionIndex: number
}) {
  const options = [
    AtencionEvaluationEstadoFinal.SATISFACTORIA,
    AtencionEvaluationEstadoFinal.CON_NOVEDADES,
    AtencionEvaluationEstadoFinal.NO_SATISFACTORIA,
  ]
  const estadoFinal = pick(options, input.dayOffset + input.atencionIndex)
  const calificacion = estadoFinal === AtencionEvaluationEstadoFinal.SATISFACTORIA
    ? 5
    : estadoFinal === AtencionEvaluationEstadoFinal.CON_NOVEDADES
      ? 4
      : 2

  await input.context.prisma.atencionEvaluation.create({
    data: {
      atencionId: input.atencionId,
      calificacion,
      estadoFinal,
      observaciones: `[SEED] Evaluación demo ${estadoFinal.toLowerCase().replace("_", " ")}.`,
      evaluatedById: input.evaluatedById,
      evaluatedAt: addMinutes(input.context.now, -60),
    },
  })
}

async function upsertPenaltyForSeed(input: {
  context: SeedContext
  guiaId: string
  turnoId: number
  reason: string
  startsAt: Date
  expiresAt: Date
  createdById: string
}) {
  await input.context.prisma.guiaPenalty.create({
    data: {
      guiaId: input.guiaId,
      turnoId: input.turnoId,
      motivo: "NO_SHOW",
      reason: input.reason,
      startsAt: input.startsAt,
      expiresAt: input.expiresAt,
      createdById: input.createdById,
    },
  })

  if (input.expiresAt > input.context.now) {
    await input.context.prisma.guia.update({
      where: { id: input.guiaId },
      data: { pendingPenalty: true },
    })
  }
}

async function seedDisponibilidadesForAtencion(input: {
  context: SeedContext
  atencionId: number
  rows: Array<{ guiaId: string; marcadoAt: Date; penalizado: boolean }>
}) {
  for (const row of input.rows) {
    await input.context.prisma.disponibilidad.create({
      data: {
        atencionId: input.atencionId,
        guiaId: row.guiaId,
        marcadoAt: row.marcadoAt,
        penalizado: row.penalizado,
      },
    })
  }
}

function buildDisponibilidadRows(users: DemoUsers, reference: Date, seed: number) {
  const rows: Array<{ guiaId: string; marcadoAt: Date; penalizado: boolean }> = []
  const count = 4 + positiveModulo(seed, 4)
  const used = new Set<string>()

  for (let i = 0; i < count; i++) {
    const guide = pickGuide(users, seed + i)
    if (!guide.guiaId || used.has(guide.guiaId)) continue
    used.add(guide.guiaId)
    rows.push({
      guiaId: guide.guiaId,
      marcadoAt: addMinutes(reference, -90 + i * 7),
      penalizado: i === count - 1 && positiveModulo(seed, 5) === 0,
    })
  }

  return rows
}

async function seedOperationalNotifications(input: {
  context: SeedContext
  users: DemoUsers
  refs: ScenarioRefs
}) {
  const { context, users, refs } = input
  const pendingTurnoId = refs.pendingCheckInTurnoIds[0]
  const noShowTurnoId = refs.noShowTurnoIds[0]
  const upcomingAtencionId = refs.upcomingAtencionIds[0]

  if (upcomingAtencionId) {
    await upsertSeedNotification({
      context,
      userId: users.guides[0].userId,
      guiaId: users.guides[0].guiaId,
      type: NotificationType.ATENCION_AVAILABLE_FOR_GUIDE,
      notificationId: `seed:availability:${upcomingAtencionId}:${users.guides[0].userId}`,
      title: "[SEED] Disponibilidad abierta",
      body: "Hay una atención próxima disponible para registrar disponibilidad.",
      atencionId: upcomingAtencionId,
      payload: { source: "seed", scenario: "availability", atencionId: upcomingAtencionId },
    })
  }

  if (pendingTurnoId) {
    await upsertSeedNotification({
      context,
      userId: users.supervisors[0].userId,
      type: NotificationType.SUPERVISOR_CHECKIN_PENDING,
      notificationId: `seed:supervisor-checkin:${pendingTurnoId}:${users.supervisors[0].userId}`,
      title: "[SEED] Check-in por validar",
      body: "Un guía solicitó check-in y requiere confirmación del supervisor.",
      turnoId: pendingTurnoId,
      payload: { source: "seed", scenario: "pending-checkin", turnoId: pendingTurnoId },
    })
  }

  if (noShowTurnoId) {
    await upsertSeedNotification({
      context,
      userId: users.guides[2].userId,
      guiaId: users.guides[2].guiaId,
      type: NotificationType.GUIDE_PENALIZED,
      notificationId: `seed:penalty:${noShowTurnoId}:${users.guides[2].userId}`,
      title: "[SEED] Penalización registrada",
      body: "Se registró una penalización por no presentación a un turno asignado.",
      turnoId: noShowTurnoId,
      payload: { source: "seed", scenario: "penalty", reason: "NO_SHOW" },
    })
  }

  console.log("Operational notifications ready")
}

async function upsertSeedNotification(input: {
  context: SeedContext
  userId: string
  guiaId?: string
  type: NotificationType
  notificationId: string
  title: string
  body: string
  recaladaId?: number
  atencionId?: number
  turnoId?: number
  payload?: Prisma.InputJsonValue
}) {
  await input.context.prisma.notificationDelivery.create({
    data: {
      type: input.type,
      channel: NotificationChannel.PUSH,
      status: NotificationStatus.PENDING,
      userId: input.userId,
      guiaId: input.guiaId ?? null,
      recaladaId: input.recaladaId ?? null,
      atencionId: input.atencionId ?? null,
      turnoId: input.turnoId ?? null,
      notificationId: input.notificationId,
      title: input.title,
      body: input.body,
      payload: input.payload ?? Prisma.JsonNull,
      attempts: 0,
    },
  })
}

function pick<T>(items: T[], seed: number) {
  return items[positiveModulo(seed, items.length)]
}

function getNextUniqueShipId(catalogs: CatalogRefs, index: number) {
  if (index >= catalogs.buqueIds.length) {
    throw new Error(
      `Seed needs ${index + 1} unique ships to avoid unrealistic repeated recaladas, but only ${catalogs.buqueIds.length} are active`,
    )
  }
  return catalogs.buqueIds[index]
}

function pickGuide(users: DemoUsers, seed: number) {
  return pick(users.guides, seed)
}

function pickSupervisor(users: DemoUsers, seed: number) {
  return pick(users.supervisors, seed)
}

function positiveModulo(value: number, modulo: number) {
  return ((value % modulo) + modulo) % modulo
}
