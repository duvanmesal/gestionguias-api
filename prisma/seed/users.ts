import {
  DocumentType,
  ProfileStatus,
  RolType,
} from "@prisma/client"

import type { SeedContext } from "./context"
import { hashPassword } from "./security"

export type SeedUserRef = {
  userId: string
  guiaId?: string
  supervisorId?: string
  email: string
}

export type DemoUsers = {
  supervisors: SeedUserRef[]
  guides: SeedUserRef[]
}

type SeedUser = {
  email: string
  passwordEnv?: string
  nombres: string
  apellidos: string
  rol: RolType
  documentType: DocumentType
  documentNumber: string
  telefono: string
  direccion?: string
}

function resolveSeedUserPassword(context: SeedContext, passwordEnv?: string) {
  const value = passwordEnv ? context.env[passwordEnv] : undefined
  const fallback = context.env.SEED_DEMO_USER_PASS
  if (!value && !fallback) {
    throw new Error(
      `Missing required seed environment variable: ${passwordEnv ?? "SEED_DEMO_USER_PASS"}`,
    )
  }
  return value ?? fallback!
}

export async function upsertDemoUsers(context: SeedContext): Promise<DemoUsers> {
  const users: SeedUser[] = [
    { email: context.env.SEED_SUPERVISOR_1_EMAIL ?? "supervisor1@test.com", passwordEnv: "SEED_SUPERVISOR_1_PASS", nombres: "María", apellidos: "González", rol: RolType.SUPERVISOR, documentType: DocumentType.CC, documentNumber: "1001001001", telefono: "+57 300 123 4567" },
    { email: context.env.SEED_SUPERVISOR_2_EMAIL ?? "supervisor2@test.com", passwordEnv: "SEED_SUPERVISOR_2_PASS", nombres: "Julián", apellidos: "Pérez", rol: RolType.SUPERVISOR, documentType: DocumentType.CC, documentNumber: "1001001002", telefono: "+57 300 123 4568" },
    { email: "supervisor.operaciones@test.com", nombres: "Valentina", apellidos: "Barrios", rol: RolType.SUPERVISOR, documentType: DocumentType.CC, documentNumber: "1001001003", telefono: "+57 300 123 4569" },
    { email: context.env.SEED_GUIA_1_EMAIL ?? "guia1@test.com", passwordEnv: "SEED_GUIA_1_PASS", nombres: "Carlos", apellidos: "Rodríguez", rol: RolType.GUIA, documentType: DocumentType.CC, documentNumber: "73000101", telefono: "+57 300 555 0001", direccion: "Getsemaní, Cartagena" },
    { email: context.env.SEED_GUIA_2_EMAIL ?? "guia2@test.com", passwordEnv: "SEED_GUIA_2_PASS", nombres: "Ana", apellidos: "Martínez", rol: RolType.GUIA, documentType: DocumentType.CC, documentNumber: "73000102", telefono: "+57 300 555 0002", direccion: "Manga, Cartagena" },
    { email: context.env.SEED_GUIA_3_EMAIL ?? "guia3@test.com", passwordEnv: "SEED_GUIA_3_PASS", nombres: "Sofía", apellidos: "López", rol: RolType.GUIA, documentType: DocumentType.CC, documentNumber: "73000103", telefono: "+57 300 555 0003", direccion: "Centro Histórico, Cartagena" },
    { email: context.env.SEED_GUIA_4_EMAIL ?? "guia4@test.com", passwordEnv: "SEED_GUIA_4_PASS", nombres: "Mateo", apellidos: "García", rol: RolType.GUIA, documentType: DocumentType.CE, documentNumber: "CE900104", telefono: "+57 300 555 0004", direccion: "Crespo, Cartagena" },
    { email: "guia5@test.com", nombres: "Laura", apellidos: "Herrera", rol: RolType.GUIA, documentType: DocumentType.CC, documentNumber: "73000105", telefono: "+57 300 555 0005", direccion: "Bocagrande, Cartagena" },
    { email: "guia6@test.com", nombres: "Andrés", apellidos: "Mejía", rol: RolType.GUIA, documentType: DocumentType.CC, documentNumber: "73000106", telefono: "+57 300 555 0006", direccion: "Pie de la Popa, Cartagena" },
    { email: "guia7@test.com", nombres: "Camila", apellidos: "Torres", rol: RolType.GUIA, documentType: DocumentType.CC, documentNumber: "73000107", telefono: "+57 300 555 0007", direccion: "Marbella, Cartagena" },
    { email: "guia8@test.com", nombres: "Daniel", apellidos: "Ruiz", rol: RolType.GUIA, documentType: DocumentType.CC, documentNumber: "73000108", telefono: "+57 300 555 0008", direccion: "El Laguito, Cartagena" },
    { email: "guia9@test.com", nombres: "Isabela", apellidos: "Moreno", rol: RolType.GUIA, documentType: DocumentType.CC, documentNumber: "73000109", telefono: "+57 300 555 0009", direccion: "Castillogrande, Cartagena" },
    { email: "guia10@test.com", nombres: "Felipe", apellidos: "Navarro", rol: RolType.GUIA, documentType: DocumentType.CC, documentNumber: "73000110", telefono: "+57 300 555 0010", direccion: "Torices, Cartagena" },
  ]

  const supervisors: SeedUserRef[] = []
  const guides: SeedUserRef[] = []

  for (const seed of users) {
    const seedPassword = resolveSeedUserPassword(context, seed.passwordEnv)
    const passwordHash = await hashPassword(context, seedPassword)
    const user = await context.prisma.usuario.upsert({
      where: { email: seed.email },
      update: {
        passwordHash,
        nombres: seed.nombres,
        apellidos: seed.apellidos,
        rol: seed.rol,
        activo: true,
        profileStatus: ProfileStatus.COMPLETE,
        profileCompletedAt: context.now,
        emailVerifiedAt: context.now,
        documentType: seed.documentType,
        documentNumber: seed.documentNumber,
        telefono: seed.telefono,
      },
      create: {
        email: seed.email,
        passwordHash,
        nombres: seed.nombres,
        apellidos: seed.apellidos,
        rol: seed.rol,
        activo: true,
        profileStatus: ProfileStatus.COMPLETE,
        profileCompletedAt: context.now,
        emailVerifiedAt: context.now,
        documentType: seed.documentType,
        documentNumber: seed.documentNumber,
        telefono: seed.telefono,
      },
    })

    if (seed.rol === RolType.SUPERVISOR) {
      const supervisor = await context.prisma.supervisor.upsert({
        where: { usuarioId: user.id },
        update: { telefono: seed.telefono },
        create: { usuarioId: user.id, telefono: seed.telefono },
      })
      supervisors.push({ email: seed.email, userId: user.id, supervisorId: supervisor.id })
    }

    if (seed.rol === RolType.GUIA) {
      const guia = await context.prisma.guia.upsert({
        where: { usuarioId: user.id },
        update: {
          telefono: seed.telefono,
          direccion: seed.direccion ?? "Cartagena, Colombia",
          disponibleParaTurnos: false,
          disponibilidadUpdatedAt: null,
          pendingPenalty: false,
        },
        create: {
          usuarioId: user.id,
          telefono: seed.telefono,
          direccion: seed.direccion ?? "Cartagena, Colombia",
          disponibleParaTurnos: false,
          disponibilidadUpdatedAt: null,
          pendingPenalty: false,
        },
      })
      guides.push({ email: seed.email, userId: user.id, guiaId: guia.id })
    }
  }

  console.log(`Demo users ready: ${supervisors.length} supervisors, ${guides.length} guides`)
  return { supervisors, guides }
}
