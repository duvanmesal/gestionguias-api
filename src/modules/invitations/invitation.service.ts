import { prisma } from "../../prisma/client"
import { hashPassword } from "../../libs/password"
import { sendInvitationEmail } from "../../libs/email"
import { logger } from "../../libs/logger"
import { ConflictError, NotFoundError, BadRequestError } from "../../libs/errors"
import type { RolType, InvitationStatus } from "@prisma/client"
import crypto from "crypto"

const INVITE_TTL_HOURS = Number.parseInt(process.env.INVITE_TTL_HOURS || "24", 10)
const PASSWORD_PEPPER = process.env.PASSWORD_PEPPER || ""

/** Genera una contraseña temporal de 12 chars segura */
function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%"
  let password = ""
  const randomBytes = crypto.randomBytes(12)
  for (let i = 0; i < 12; i++) password += chars[randomBytes[i] % chars.length]
  return password
}

function generateInvitationToken(): string {
  return crypto.randomBytes(32).toString("hex")
}

function hashToken(token: string): string {
  return crypto.createHmac("sha256", PASSWORD_PEPPER).update(token).digest("hex")
}

export interface CreateInvitationResult {
  invitation: {
    id: string
    email: string
    role: RolType
    expiresAt: Date
    status: InvitationStatus
  }
  /** ⚠️ Solo para testing/dev. NO exponer en producción por API. */
  tempPassword: string
}

export class InvitationService {
  /**
   * Crea la invitación, crea Usuario activo con la contraseña temporal (hash),
   * enlaza invitation.userId y envía el correo. Si el envío falla → rollback.
   */
  async createInvitation(emailRaw: string, role: RolType, inviterId: string): Promise<CreateInvitationResult> {
    const email = emailRaw.toLowerCase()
    logger.info({ email, role, inviterId }, "[Invite] start createInvitation")

    // Conflictos típicos
    const existingUser = await prisma.usuario.findUnique({ where: { email } })
    if (existingUser) {
      logger.warn({ email, existingUserId: existingUser.id }, "[Invite] user already exists")
      throw new ConflictError("User with this email already exists")
    }

    const pendingInvitation = await prisma.invitation.findFirst({
      where: { email, status: "PENDING", expiresAt: { gt: new Date() } },
    })
    if (pendingInvitation) {
      logger.warn({ email, invitationId: pendingInvitation.id }, "[Invite] active invitation already exists")
      throw new ConflictError("An active invitation already exists for this email")
    }

    // Generar credenciales temporales
    const tempPassword = generateTempPassword()
    const tempPasswordHash = await hashPassword(tempPassword)
    const token = generateInvitationToken()
    const tokenHash = hashToken(token)
    const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 60 * 60 * 1000)

    // Crear invitación
    const invitation = await prisma.invitation.create({
      data: {
        email,
        role,
        tempPasswordHash,
        tokenHash,
        expiresAt,
        inviterId,
        status: "PENDING",
      },
    })

    // Crear Usuario (obligatorio enviar nombres/apellidos)
    const user = await prisma.usuario.create({
      data: {
        email,
        rol: role,
        activo: true,
        passwordHash: tempPasswordHash,
        nombres: "Invitado",
        apellidos: "Pendiente",
      },
      select: { id: true, email: true },
    })

    // Enlazar invitación → userId
    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { userId: user.id },
    })

    logger.info(
      { email, role, inviterId, invitationId: invitation.id, userId: user.id, expiresAt },
      "[Invite] invitation + user created and linked"
    )

    // Enviar correo (rollback si falla)
    try {
      const inviter = await prisma.usuario.findUnique({
        where: { id: inviterId },
        select: { nombres: true, apellidos: true },
      })

      await sendInvitationEmail({
        email,
        tempPassword,
        inviterName: inviter ? `${inviter.nombres} ${inviter.apellidos}` : undefined,
        expiresInHours: INVITE_TTL_HOURS,
      })

      logger.info({ invitationId: invitation.id, email, role, inviterId }, "[Invite] email sent")
    } catch (error) {
      logger.error(
        { invitationId: invitation.id, email, userId: user.id, err: (error as Error)?.message },
        "[Invite] email failed; rolling back invitation and user"
      )
      // best-effort rollback
      try { await prisma.invitation.delete({ where: { id: invitation.id } }) } catch {}
      try { await prisma.usuario.delete({ where: { id: user.id } }) } catch {}
      throw new Error("Failed to send invitation email")
    }

    return {
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expiresAt,
        status: invitation.status,
      },
      tempPassword, // ⚠️ solo dev/test
    }
  }

  async markInvitationAsUsed(invitationId: string, userId: string): Promise<void> {
    await prisma.invitation.update({
      where: { id: invitationId },
      data: { status: "USED", usedAt: new Date(), userId },
    })
    logger.info({ invitationId, userId }, "[Invite] marked as used")
  }

  async findValidInvitation(emailRaw: string) {
    const email = emailRaw.toLowerCase()
    return prisma.invitation.findFirst({
      where: { email, status: "PENDING", expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    })
  }

  async expireOldInvitations(): Promise<number> {
    const result = await prisma.invitation.updateMany({
      where: { status: "PENDING", expiresAt: { lte: new Date() } },
      data: { status: "EXPIRED" },
    })
    if (result.count > 0) logger.info({ count: result.count }, "[Invite] expired old invitations")
    return result.count
  }

  async listInvitations(filters?: { status?: InvitationStatus; email?: string }) {
    const where = {
      ...(filters?.status ? { status: filters.status } : {}),
      ...(filters?.email ? { email: filters.email.toLowerCase() } : {}),
    }
    return prisma.invitation.findMany({
      where,
      include: {
        inviter: { select: { id: true, email: true, nombres: true, apellidos: true } },
        user: { select: { id: true, email: true, profileStatus: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    })
  }

  /**
   * Reenvía la invitación:
   * - Regenera tempPassword y actualiza invitation.tempPasswordHash + expiresAt
   * - Upsert de usuario:
   *    - si existe → actualiza passwordHash y lo deja activo
   *    - si no existe → lo crea (con nombres/apellidos obligatorios)
   * - Enlaza invitation.userId si estaba vacío
   */
  async resendInvitation(invitationId: string, resenderId: string): Promise<void> {
    const invitation = await prisma.invitation.findUnique({ where: { id: invitationId } })
    if (!invitation) throw new NotFoundError("Invitation not found")
    if (invitation.status === "USED") throw new BadRequestError("Cannot resend a used invitation")

    const email = invitation.email.toLowerCase()
    const tempPassword = generateTempPassword()
    const tempPasswordHash = await hashPassword(tempPassword)
    const token = generateInvitationToken()
    const tokenHash = hashToken(token)
    const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 60 * 60 * 1000)

    // Upsert usuario (con nombres/apellidos obligatorios)
    const user = await prisma.usuario.upsert({
      where: { email },
      create: {
        email,
        rol: invitation.role,
        activo: true,
        passwordHash: tempPasswordHash,
        nombres: "Invitado",
        apellidos: "Pendiente",
      },
      update: {
        passwordHash: tempPasswordHash,
        activo: true,
      },
      select: { id: true, email: true },
    })

    // Actualizar invitación y enlazar userId si faltaba
    await prisma.invitation.update({
      where: { id: invitationId },
      data: {
        tempPasswordHash,
        tokenHash,
        expiresAt,
        status: "PENDING",
        usedAt: null,
        ...(invitation.userId ? {} : { userId: user.id }),
      },
    })

    const resender = await prisma.usuario.findUnique({
      where: { id: resenderId },
      select: { nombres: true, apellidos: true },
    })

    await sendInvitationEmail({
      email,
      tempPassword,
      inviterName: resender ? `${resender.nombres} ${resender.apellidos}` : undefined,
      expiresInHours: INVITE_TTL_HOURS,
    })

    logger.info(
      { invitationId, email, resenderId, userId: user.id, expiresAt },
      "[Invite] resent with new temp password and user upserted"
    )
  }
}

export const invitationService = new InvitationService()
