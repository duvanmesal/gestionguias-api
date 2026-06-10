import { DocumentType, RolType } from "@prisma/client"
import { prisma } from "../../../prisma/client"
import argon2 from "argon2"
import crypto from "crypto"

export type BulkGuiaItemInput = {
  email?: string
  nombres?: string
  apellidos?: string
  telefono?: string
  documentType?: string
  documentNumber?: string
  direccion?: string
  activo?: boolean
  disponibleParaTurnos?: boolean
}

export type BulkGuiaMode = "UPSERT" | "CREATE_ONLY"

export type BulkGuiaRequest = {
  mode: BulkGuiaMode
  dryRun: boolean
  sendInvites: boolean
  items: BulkGuiaItemInput[]
}

type BulkError = { index: number; email?: string; message: string }

export type BulkGuiaResult = {
  mode: BulkGuiaMode
  dryRun: boolean
  requested: number
  created: number
  updated: number
  skipped: number
  failed: number
  errors: BulkError[]
}

function validDocType(v: string): v is DocumentType {
  return ["CC", "CE", "PAS", "NIT", "OTRO"].includes(v)
}

export async function bulkUploadGuiasUsecase(body: BulkGuiaRequest): Promise<BulkGuiaResult> {
  const { mode, dryRun, sendInvites, items } = body
  const errors: BulkError[] = []
  const invalid = new Set<number>()

  type Normalized = {
    index: number
    email: string
    nombres: string
    apellidos: string
    telefono?: string
    documentType?: DocumentType
    documentNumber?: string
    direccion?: string
    activo: boolean
    disponibleParaTurnos: boolean
  }

  const normalized: Normalized[] = []

  for (let i = 0; i < items.length; i++) {
    const raw = items[i]!
    const email = (raw.email ?? "").trim().toLowerCase()
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push({ index: i, email: raw.email, message: "email requerido y válido" })
      invalid.add(i)
      continue
    }
    const nombres = (raw.nombres ?? "").trim()
    if (!nombres) {
      errors.push({ index: i, email, message: "nombres requerido" })
      invalid.add(i)
      continue
    }
    const apellidos = (raw.apellidos ?? "").trim()
    if (!apellidos) {
      errors.push({ index: i, email, message: "apellidos requerido" })
      invalid.add(i)
      continue
    }

    let documentType: DocumentType | undefined
    if (raw.documentType) {
      const dt = raw.documentType.trim().toUpperCase()
      if (!validDocType(dt)) {
        errors.push({ index: i, email, message: `documentType inválido: ${raw.documentType}` })
        invalid.add(i)
        continue
      }
      documentType = dt as DocumentType
    }

    normalized.push({
      index: i,
      email,
      nombres,
      apellidos,
      telefono: raw.telefono?.trim() || undefined,
      documentType,
      documentNumber: raw.documentNumber?.trim() || undefined,
      direccion: raw.direccion?.trim() || undefined,
      activo: raw.activo !== false,
      disponibleParaTurnos: raw.disponibleParaTurnos === true,
    })
  }

  // Check duplicate emails in payload
  const seenEmail = new Map<string, number>()
  for (const it of normalized) {
    const prev = seenEmail.get(it.email)
    if (prev !== undefined) {
      errors.push({ index: it.index, email: it.email, message: `Email duplicado en payload (primer índice: ${prev})` })
      invalid.add(it.index)
      continue
    }
    seenEmail.set(it.email, it.index)
  }

  // Pre-fetch existing users
  const emails = Array.from(seenEmail.keys())
  const existingUsers = emails.length
    ? await prisma.usuario.findMany({
        where: { email: { in: emails } },
        select: {
          id: true,
          email: true,
          rol: true,
          activo: true,
          guia: { select: { id: true } },
        },
      })
    : []
  const existingByEmail = new Map(existingUsers.map((u) => [u.email, u]))

  let created = 0
  let updated = 0
  let skipped = 0
  let failed = errors.length

  for (const it of normalized) {
    if (invalid.has(it.index)) continue

    const existing = existingByEmail.get(it.email)

    if (mode === "CREATE_ONLY" && existing) {
      skipped++
      continue
    }

    if (existing) {
      // UPSERT: update existing usuario and upsert guia profile
      if (existing.rol !== RolType.GUIA) {
        errors.push({ index: it.index, email: it.email, message: `El usuario ya existe con rol ${existing.rol}, no se puede convertir a GUIA` })
        failed++
        continue
      }
      if (dryRun) { updated++; continue }
      try {
        await prisma.$transaction(async (tx) => {
          await tx.usuario.update({
            where: { id: existing.id },
            data: {
              nombres: it.nombres,
              apellidos: it.apellidos,
              activo: it.activo,
              ...(it.documentType ? { documentType: it.documentType } : {}),
              ...(it.documentNumber ? { documentNumber: it.documentNumber } : {}),
              ...(it.telefono ? { telefono: it.telefono } : {}),
            },
          })
          await tx.guia.upsert({
            where: { usuarioId: existing.id },
            update: {
              ...(it.telefono !== undefined ? { telefono: it.telefono } : {}),
              ...(it.direccion !== undefined ? { direccion: it.direccion } : {}),
              disponibleParaTurnos: it.disponibleParaTurnos,
            },
            create: {
              usuarioId: existing.id,
              telefono: it.telefono ?? null,
              direccion: it.direccion ?? null,
              disponibleParaTurnos: it.disponibleParaTurnos,
            },
          })
        })
        updated++
      } catch (err: any) {
        errors.push({ index: it.index, email: it.email, message: err?.message ?? "Error inesperado" })
        failed++
      }
      continue
    }

    // CREATE new guia
    if (dryRun) { created++; continue }
    try {
      const tempPassword = crypto.randomBytes(12).toString("base64url")
      const passwordHash = await argon2.hash(tempPassword)

      await prisma.$transaction(async (tx) => {
        const user = await tx.usuario.create({
          data: {
            email: it.email,
            passwordHash,
            nombres: it.nombres,
            apellidos: it.apellidos,
            rol: RolType.GUIA,
            activo: it.activo,
            ...(it.documentType ? { documentType: it.documentType } : {}),
            ...(it.documentNumber ? { documentNumber: it.documentNumber } : {}),
            ...(it.telefono ? { telefono: it.telefono } : {}),
          },
          select: { id: true },
        })

        await tx.guia.create({
          data: {
            usuarioId: user.id,
            telefono: it.telefono ?? null,
            direccion: it.direccion ?? null,
            disponibleParaTurnos: it.disponibleParaTurnos,
          },
        })

        if (sendInvites) {
          const token = crypto.randomBytes(32).toString("hex")
          const tokenHash = crypto.createHash("sha256").update(token).digest("hex")
          const tempPwHash = await argon2.hash(tempPassword)

          await tx.invitation.create({
            data: {
              email: it.email,
              role: RolType.GUIA,
              tempPasswordHash: tempPwHash,
              tokenHash,
              status: "PENDING",
              expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
              inviterId: (await tx.usuario.findFirstOrThrow({
                where: { rol: RolType.SUPER_ADMIN },
                select: { id: true },
              })).id,
              userId: user.id,
            },
          })
        }
      })
      created++
    } catch (err: any) {
      errors.push({ index: it.index, email: it.email, message: err?.message ?? "Error inesperado" })
      failed++
    }
  }

  return { mode, dryRun, requested: items.length, created, updated, skipped, failed, errors }
}
