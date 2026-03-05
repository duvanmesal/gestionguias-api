import type { InvitationStatus, Prisma, RolType } from "@prisma/client";

import { prisma } from "../../../prisma/client";
import { invitationListSelect, invitationMinimalSelect } from "./invitation.select";

export type Tx = Prisma.TransactionClient;

function db(tx?: Tx) {
  return tx ?? prisma;
}

export class InvitationRepository {
  // -------------------------
  // Transactions
  // -------------------------
  transaction<T>(fn: (tx: Tx) => Promise<T>) {
    return prisma.$transaction(fn);
  }

  // -------------------------
  // Users
  // -------------------------
  findUserByEmail(email: string, tx?: Tx) {
    return db(tx).usuario.findUnique({
      where: { email },
      select: { id: true, profileStatus: true },
    });
  }

  upsertUserForInvitation(
    args: { email: string; role: RolType; passwordHash: string },
    tx?: Tx,
  ) {
    return db(tx).usuario.upsert({
      where: { email: args.email },
      create: {
        email: args.email,
        rol: args.role,
        activo: true,
        passwordHash: args.passwordHash,
        nombres: "Invitado",
        apellidos: "Pendiente",
      },
      update: {
        passwordHash: args.passwordHash,
        activo: true,
        rol: args.role,
      },
      select: { id: true, email: true },
    });
  }

  upsertUserForResend(
    args: { email: string; role: RolType; passwordHash: string },
    tx?: Tx,
  ) {
    return db(tx).usuario.upsert({
      where: { email: args.email },
      create: {
        email: args.email,
        rol: args.role,
        activo: true,
        passwordHash: args.passwordHash,
        nombres: "Invitado",
        apellidos: "Pendiente",
      },
      update: {
        passwordHash: args.passwordHash,
        activo: true,
      },
      select: { id: true, email: true },
    });
  }

  upsertGuiaForUser(userId: string, tx?: Tx) {
    return db(tx).guia.upsert({
      where: { usuarioId: userId },
      create: { usuarioId: userId },
      update: {},
      select: { id: true },
    });
  }

  upsertSupervisorForUser(userId: string, tx?: Tx) {
    return db(tx).supervisor.upsert({
      where: { usuarioId: userId },
      create: { usuarioId: userId },
      update: {},
      select: { id: true },
    });
  }

  findUserNameById(userId: string, tx?: Tx) {
    return db(tx).usuario.findUnique({
      where: { id: userId },
      select: { nombres: true, apellidos: true },
    });
  }

  // -------------------------
  // Invitations: Reads
  // -------------------------
  findActivePendingInvitation(email: string, tx?: Tx) {
    return db(tx).invitation.findFirst({
      where: { email, status: "PENDING", expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { id: true, expiresAt: true, status: true },
    });
  }

  findLastInvitationIdByEmail(email: string, tx?: Tx) {
    return db(tx).invitation.findFirst({
      where: { email },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
  }

  findLastInvitationByEmailDetailed(email: string, tx?: Tx) {
    return db(tx).invitation.findFirst({
      where: { email },
      orderBy: { createdAt: "desc" },
      select: invitationListSelect,
    });
  }

  findById(invitationId: string, tx?: Tx) {
    return db(tx).invitation.findUnique({ where: { id: invitationId } });
  }

  findValidByEmail(email: string, tx?: Tx) {
    return db(tx).invitation.findFirst({
      where: { email, status: "PENDING", expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
  }

  // -------------------------
  // Invitations: Lists
  // -------------------------
  list(where: Prisma.InvitationWhereInput) {
    return prisma.invitation.findMany({
      where,
      select: invitationListSelect,
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  // -------------------------
  // Invitations: Mutations
  // -------------------------
  create(data: Prisma.InvitationCreateArgs["data"], tx?: Tx) {
    return db(tx).invitation.create({
      data,
      select: invitationMinimalSelect,
    });
  }

  update(invitationId: string, data: Prisma.InvitationUpdateArgs["data"], tx?: Tx) {
    return db(tx).invitation.update({
      where: { id: invitationId },
      data,
      select: invitationMinimalSelect,
    });
  }

  updateStatus(invitationId: string, status: InvitationStatus, tx?: Tx) {
    return db(tx).invitation.update({
      where: { id: invitationId },
      data: { status },
      select: { id: true, status: true },
    });
  }

  markUsed(invitationId: string, userId: string, when: Date, tx?: Tx) {
    return db(tx).invitation.update({
      where: { id: invitationId },
      data: { status: "USED", usedAt: when, userId },
      select: { id: true },
    });
  }

  expireOldInvitations(tx?: Tx) {
    return db(tx).invitation.updateMany({
      where: { status: "PENDING", expiresAt: { lte: new Date() } },
      data: { status: "EXPIRED" },
    });
  }
}

export const invitationRepository = new InvitationRepository();