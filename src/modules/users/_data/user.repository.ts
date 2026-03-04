import type { Prisma, RolType, DocumentType } from "@prisma/client"

import { prisma } from "../../../prisma/client"
import {
  userMeSelect,
  userDetailSelect,
  userListSelect,
  userCreateSelect,
  userUpdateSelect,
  userUpdateMeSelect,
  userCompleteProfileSelect,
} from "./user.select"

export class UserRepository {
  // -------------------------
  // Reads
  // -------------------------
  findMe(userId: string) {
    return prisma.usuario.findUnique({ where: { id: userId }, select: userMeSelect })
  }

  findByIdDetail(id: string) {
    return prisma.usuario.findUnique({ where: { id }, select: userDetailSelect })
  }

  findByIdBasic(id: string) {
    return prisma.usuario.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        activo: true,
        rol: true,
        passwordHash: true,
        profileStatus: true,
        documentType: true,
        documentNumber: true,
      },
    })
  }

  findByEmail(email: string) {
    return prisma.usuario.findUnique({ where: { email } })
  }

  findByDocument(args: {
    documentType: DocumentType
    documentNumber: string
    excludeUserId: string
  }) {
    return prisma.usuario.findFirst({
      where: {
        documentType: args.documentType,
        documentNumber: args.documentNumber,
        id: { not: args.excludeUserId },
      },
      select: { id: true, email: true },
    })
  }

  // -------------------------
  // Lists
  // -------------------------
  countUsers(where: Prisma.UsuarioWhereInput) {
    return prisma.usuario.count({ where })
  }

  listUsers(args: {
    where: Prisma.UsuarioWhereInput
    orderBy: Prisma.UsuarioOrderByWithRelationInput[]
    skip: number
    take: number
  }) {
    return prisma.usuario.findMany({
      where: args.where,
      select: userListSelect,
      orderBy: args.orderBy,
      skip: args.skip,
      take: args.take,
    })
  }

  // -------------------------
  // Guide lookup
  // -------------------------
  listGuidesLookup(args: { whereUser: Prisma.UsuarioWhereInput; take?: number }) {
    return prisma.guia.findMany({
      where: { usuario: args.whereUser },
      select: {
        id: true,
        usuario: {
          select: {
            email: true,
            nombres: true,
            apellidos: true,
            activo: true,
          },
        },
      },
      orderBy: [
        { usuario: { nombres: "asc" } },
        { usuario: { apellidos: "asc" } },
        { id: "asc" },
      ],
      take: args.take ?? 500,
    })
  }

  // -------------------------
  // Mutations
  // -------------------------
  createUser(data: {
    email: string
    passwordHash: string
    nombres: string
    apellidos: string
    rol: RolType
  }) {
    return prisma.usuario.create({
      data: {
        email: data.email,
        passwordHash: data.passwordHash,
        nombres: data.nombres,
        apellidos: data.apellidos,
        rol: data.rol,
        activo: true,
      },
      select: userCreateSelect,
    })
  }

  updateUser(id: string, data: Prisma.UsuarioUpdateInput) {
    return prisma.usuario.update({ where: { id }, data, select: userUpdateSelect })
  }

  updateMe(userId: string, data: Prisma.UsuarioUpdateInput) {
    return prisma.usuario.update({ where: { id: userId }, data, select: userUpdateMeSelect })
  }

  updatePasswordHash(userId: string, newPasswordHash: string) {
    return prisma.usuario.update({ where: { id: userId }, data: { passwordHash: newPasswordHash } })
  }

  revokeActiveSessions(userId: string, now: Date) {
    return prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now, lastRotatedAt: now },
    })
  }

  deactivateUserAndRevokeTokensAtomic(userId: string, now: Date) {
    return prisma.$transaction([
      prisma.usuario.update({ where: { id: userId }, data: { activo: false } }),
      prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      }),
    ])
  }

  activateUser(userId: string) {
    return prisma.usuario.update({ where: { id: userId }, data: { activo: true } })
  }

  completeProfileUpdate(userId: string, data: {
    nombres: string
    apellidos: string
    telefono: string
    documentType: DocumentType
    documentNumber: string
    now: Date
  }) {
    return prisma.usuario.update({
      where: { id: userId },
      data: {
        nombres: data.nombres,
        apellidos: data.apellidos,
        telefono: data.telefono,
        documentType: data.documentType,
        documentNumber: data.documentNumber,
        profileStatus: "COMPLETE",
        profileCompletedAt: data.now,
      },
      select: userCompleteProfileSelect,
    })
  }

  upsertGuiaForUser(userId: string) {
    return prisma.guia.upsert({
      where: { usuarioId: userId },
      create: { usuarioId: userId },
      update: {},
    })
  }

  upsertSupervisorForUser(userId: string) {
    return prisma.supervisor.upsert({
      where: { usuarioId: userId },
      create: { usuarioId: userId },
      update: {},
    })
  }
}

export const userRepository = new UserRepository()