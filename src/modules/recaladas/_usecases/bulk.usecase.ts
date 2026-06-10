import type { Request } from "express"
import { prisma } from "../../../prisma/client"
import { recaladaRepository } from "../_data/recalada.repository"
import { buildCodigoRecalada, tempCodigoRecalada } from "../_domain/recalada.rules"
import { emitRecaladaRealtime } from "../../../core/socket/domain-events"

export type BulkRecaladaItemInput = {
  codigoRecalada?: string
  buqueCodigo?: string
  buqueId?: number
  paisOrigenCodigo?: string
  paisOrigenId?: number
  supervisorEmail?: string
  supervisorId?: string
  slotNumero?: number
  slotId?: number
  fechaLlegada?: string | Date
  fechaSalida?: string | Date
  pasajerosEstimados?: number
  tripulacionEstimada?: number
  observaciones?: string
}

export type BulkRecaladaMode = "UPSERT" | "CREATE_ONLY"

export type BulkRecaladaRequest = {
  mode: BulkRecaladaMode
  dryRun: boolean
  items: BulkRecaladaItemInput[]
}

type BulkError = { index: number; codigoRecalada?: string; message: string }

export type BulkRecaladaResult = {
  mode: BulkRecaladaMode
  dryRun: boolean
  requested: number
  created: number
  updated: number
  skipped: number
  failed: number
  errors: BulkError[]
}

function prismaMsg(err: any) {
  if (err?.code === "P2002") return `Unique constraint failed`
  if (err?.code === "P2003") return `Foreign key constraint failed`
  return err?.message ?? "Unexpected error"
}

export async function bulkUploadRecaladasUsecase(
  _req: Request,
  body: BulkRecaladaRequest,
): Promise<BulkRecaladaResult> {
  const { mode, dryRun, items } = body
  const errors: BulkError[] = []
  const invalid = new Set<number>()

  // --- Pre-fetch lookup maps ---
  const allBuques = await prisma.buque.findMany({ select: { id: true, codigo: true } })
  const buqueByCode = new Map(allBuques.map((b) => [b.codigo.toUpperCase(), b.id]))
  const buqueById = new Set(allBuques.map((b) => b.id))

  const allPaises = await prisma.pais.findMany({ select: { id: true, codigo: true } })
  const paisByCode = new Map(allPaises.map((p) => [p.codigo.toUpperCase(), p.id]))
  const paisById = new Set(allPaises.map((p) => p.id))

  const allSlots = await prisma.slotOperativo.findMany()
  const slotByNumero = new Map(allSlots.map((s) => [s.numero, s]))
  const slotById = new Map(allSlots.map((s) => [s.id, s]))

  // Supervisor lookup by email
  const supervisorEmails = Array.from(
    new Set(items.map((i) => i.supervisorEmail).filter(Boolean) as string[]),
  )
  const supervisorUsers = supervisorEmails.length
    ? await prisma.usuario.findMany({
        where: { email: { in: supervisorEmails }, rol: { in: ["SUPERVISOR", "SUPER_ADMIN"] } },
        include: { supervisor: { select: { id: true } } },
      })
    : []
  const supervisorIdByEmail = new Map(
    supervisorUsers.map((u) => [u.email, u.supervisor?.id ?? null]),
  )

  // --- Normalize + validate items ---
  type NormalizedItem = {
    index: number
    codigoRecalada: string
    buqueId: number
    paisOrigenId: number
    supervisorId: string
    slotId: number | null
    fechaLlegada: Date
    fechaSalida?: Date
    pasajerosEstimados?: number
    tripulacionEstimada?: number
    observaciones?: string
  }

  const normalized: NormalizedItem[] = []

  for (let i = 0; i < items.length; i++) {
    const raw = items[i]!

    // fechaLlegada required
    if (!raw.fechaLlegada) {
      errors.push({ index: i, message: "fechaLlegada es requerida" })
      invalid.add(i)
      continue
    }
    const fechaLlegada = new Date(raw.fechaLlegada)
    if (isNaN(fechaLlegada.getTime())) {
      errors.push({ index: i, message: "fechaLlegada inválida" })
      invalid.add(i)
      continue
    }

    // buque
    let buqueId: number | undefined
    if (raw.buqueId && buqueById.has(raw.buqueId)) buqueId = raw.buqueId
    else if (raw.buqueCodigo) buqueId = buqueByCode.get(raw.buqueCodigo.toUpperCase())
    if (!buqueId) {
      errors.push({ index: i, message: `Buque no encontrado (buqueCodigo=${raw.buqueCodigo}, buqueId=${raw.buqueId})` })
      invalid.add(i)
      continue
    }

    // pais
    let paisOrigenId: number | undefined
    if (raw.paisOrigenId && paisById.has(raw.paisOrigenId)) paisOrigenId = raw.paisOrigenId
    else if (raw.paisOrigenCodigo) paisOrigenId = paisByCode.get(raw.paisOrigenCodigo.toUpperCase())
    if (!paisOrigenId) {
      errors.push({ index: i, message: `País de origen no encontrado (paisOrigenCodigo=${raw.paisOrigenCodigo})` })
      invalid.add(i)
      continue
    }

    // supervisor
    let supervisorId: string | undefined = raw.supervisorId
    if (!supervisorId && raw.supervisorEmail) {
      const sid = supervisorIdByEmail.get(raw.supervisorEmail)
      if (sid) supervisorId = sid
    }
    if (!supervisorId) {
      errors.push({ index: i, message: `Supervisor no encontrado (supervisorEmail=${raw.supervisorEmail})` })
      invalid.add(i)
      continue
    }

    // slot
    let slotId: number | null = null
    if (raw.slotId) {
      const slot = slotById.get(raw.slotId)
      if (!slot) {
        errors.push({ index: i, message: `Slot (slotId=${raw.slotId}) no encontrado` })
        invalid.add(i)
        continue
      }
      if (slot.status !== "ACTIVO") {
        errors.push({ index: i, message: `Slot ${slot.numero} está inactivo` })
        invalid.add(i)
        continue
      }
      slotId = slot.id
    } else if (raw.slotNumero) {
      const slot = slotByNumero.get(raw.slotNumero)
      if (!slot) {
        errors.push({ index: i, message: `Slot número ${raw.slotNumero} no encontrado` })
        invalid.add(i)
        continue
      }
      if (slot.status !== "ACTIVO") {
        errors.push({ index: i, message: `Slot ${slot.numero} está inactivo` })
        invalid.add(i)
        continue
      }
      slotId = slot.id
    }

    // fechaSalida
    let fechaSalida: Date | undefined
    if (raw.fechaSalida) {
      fechaSalida = new Date(raw.fechaSalida)
      if (isNaN(fechaSalida.getTime())) {
        errors.push({ index: i, message: "fechaSalida inválida" })
        invalid.add(i)
        continue
      }
      if (fechaSalida < fechaLlegada) {
        errors.push({ index: i, message: "fechaSalida debe ser >= fechaLlegada" })
        invalid.add(i)
        continue
      }
    }

    const codigoRecalada = raw.codigoRecalada?.trim() ?? ""
    normalized.push({
      index: i,
      codigoRecalada,
      buqueId,
      paisOrigenId,
      supervisorId,
      slotId,
      fechaLlegada,
      fechaSalida,
      pasajerosEstimados: raw.pasajerosEstimados,
      tripulacionEstimada: raw.tripulacionEstimada,
      observaciones: raw.observaciones,
    })
  }

  let created = 0
  let updated = 0
  let skipped = 0
  let failed = errors.length

  for (const item of normalized) {
    if (invalid.has(item.index)) continue

    // Lookup existing by codigoRecalada (if provided)
    const existing = item.codigoRecalada
      ? await prisma.recalada.findUnique({
          where: { codigoRecalada: item.codigoRecalada },
          select: { id: true, operationalStatus: true },
        })
      : null

    if (mode === "CREATE_ONLY" && existing) {
      skipped++
      continue
    }

    if (existing) {
      // UPSERT update
      if (existing.operationalStatus === "CANCELED" || existing.operationalStatus === "DEPARTED") {
        skipped++
        continue
      }
      if (dryRun) { updated++; continue }
      try {
        await prisma.recalada.update({
          where: { id: existing.id },
          data: {
            buqueId: item.buqueId,
            paisOrigenId: item.paisOrigenId,
            supervisorId: item.supervisorId,
            slotId: item.slotId,
            fechaLlegada: item.fechaLlegada,
            fechaSalida: item.fechaSalida ?? null,
            pasajerosEstimados: item.pasajerosEstimados ?? null,
            tripulacionEstimada: item.tripulacionEstimada ?? null,
            observaciones: item.observaciones ?? null,
            fuente: "IMPORT",
          },
        })
        updated++
      } catch (err: any) {
        errors.push({ index: item.index, codigoRecalada: item.codigoRecalada, message: prismaMsg(err) })
        failed++
      }
      continue
    }

    // CREATE
    if (dryRun) { created++; continue }
    try {
      await prisma.$transaction(async (tx) => {
        const tempCode = item.codigoRecalada || tempCodigoRecalada()
        const rec = await tx.recalada.create({
          data: {
            buqueId: item.buqueId,
            paisOrigenId: item.paisOrigenId,
            supervisorId: item.supervisorId,
            slotId: item.slotId,
            codigoRecalada: tempCode,
            fechaLlegada: item.fechaLlegada,
            fechaSalida: item.fechaSalida ?? null,
            pasajerosEstimados: item.pasajerosEstimados ?? null,
            tripulacionEstimada: item.tripulacionEstimada ?? null,
            observaciones: item.observaciones ?? null,
            fuente: "IMPORT",
            status: "ACTIVO",
            operationalStatus: item.fechaLlegada <= new Date() ? "ARRIVED" : "SCHEDULED",
          },
          select: { id: true, fechaLlegada: true },
        })
        if (!item.codigoRecalada) {
          await tx.recalada.update({
            where: { id: rec.id },
            data: { codigoRecalada: buildCodigoRecalada(rec.fechaLlegada, rec.id) },
          })
        }
      })
      emitRecaladaRealtime("recalada:bulkChanged", { count: 1 } as any)
      created++
    } catch (err: any) {
      errors.push({ index: item.index, codigoRecalada: item.codigoRecalada, message: prismaMsg(err) })
      failed++
    }
  }

  return { mode, dryRun, requested: items.length, created, updated, skipped, failed, errors }
}
