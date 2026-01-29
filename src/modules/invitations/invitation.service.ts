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

export type CreateInvitationAction = "CREATED" | "RESENT"

export interface CreateInvitationResult {
  action: CreateInvitationAction
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
   * Invite-or-Resend por email:
   * - Si user existe y profileStatus=COMPLETE -> conflicto (ya es usuario real)
   * - Si existe invitación PENDING vigente -> conflicto (ya hay una activa)
   * - Si user INCOMPLETE o invitación vieja -> reactiva + resetea password + pone invitación en PENDING + envía correo
   *
   * Nota: con Invitation.userId @unique lo correcto es REUSAR una invitación previa (update) en vez de crear infinitas.
   */
  async createInvitation(emailRaw: string, role: RolType, inviterId: string): Promise<CreateInvitationResult> {
    const email = emailRaw.trim().toLowerCase()
    logger.info({ email, role, inviterId }, "[Invite] start createInvitation")

    // 1) Buscar usuario existente (para decidir si se permite reinvitar)
    const existingUser = await prisma.usuario.findUnique({
      where: { email },
      select: { id: true, profileStatus: true },
    })

    // 2) Si el usuario ya es REAL (perfil completo) → no se invita
    if (existingUser && existingUser.profileStatus === "COMPLETE") {
      logger.warn({ email, userId: existingUser.id }, "[Invite] user exists and is COMPLETE")
      throw new ConflictError("User with this email already exists")
    }

    // 3) Si ya hay invitación activa (PENDING no expirada) → no se reenvía desde input
    const activeInvitation = await prisma.invitation.findFirst({
      where: { email, status: "PENDING", expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    })
    if (activeInvitation) {
      logger.warn({ email, invitationId: activeInvitation.id }, "[Invite] active invitation already exists")
      throw new ConflictError("An active invitation already exists for this email")
    }

    // 4) Generar credenciales temporales
    const tempPassword = generateTempPassword()
    const tempPasswordHash = await hashPassword(tempPassword)
    const token = generateInvitationToken()
    const tokenHash = hashToken(token)
    const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 60 * 60 * 1000)

    // 5) Upsert usuario:
    //    - si existe (INCOMPLETE) -> resetea password, activa y actualiza rol
    //    - si no existe -> lo crea como invitado
    const user = await prisma.usuario.upsert({
      where: { email },
      create: {
        email,
        rol: role,
        activo: true,
        passwordHash: tempPasswordHash,
        nombres: "Invitado",
        apellidos: "Pendiente",
      },
      update: {
        passwordHash: tempPasswordHash,
        activo: true,
        rol: role,
      },
      select: { id: true, email: true },
    })

    // 6) Reusar invitación previa si existe (por userId @unique)
    const lastInvitation = await prisma.invitation.findFirst({
      where: { email },
      orderBy: { createdAt: "desc" },
    })

    const action: CreateInvitationAction = lastInvitation ? "RESENT" : "CREATED"

    const invitation = lastInvitation
      ? await prisma.invitation.update({
          where: { id: lastInvitation.id },
          data: {
            role,
            tempPasswordHash,
            tokenHash,
            expiresAt,
            status: "PENDING",
            usedAt: null,
            userId: user.id,
            inviterId,
          },
        })
      : await prisma.invitation.create({
          data: {
            email,
            role,
            tempPasswordHash,
            tokenHash,
            expiresAt,
            inviterId,
            status: "PENDING",
            userId: user.id,
          },
        })

    logger.info(
      { email, role, inviterId, invitationId: invitation.id, userId: user.id, expiresAt, action },
      "[Invite] invite-or-resend completed",
    )

    // 7) Enviar correo (rollback mínimo si falla)
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
        "[Invite] email failed; marking invitation as EXPIRED",
      )

      // rollback mínimo: evitar dejar PENDING viva si el correo no salió
      try {
        await prisma.invitation.update({
          where: { id: invitation.id },
          data: { status: "EXPIRED" },
        })
      } catch {}

      throw new Error("Failed to send invitation email")
    }

    return {
      action,
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expiresAt,
        status: invitation.status,
      },
      tempPassword,
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

  /**
   * Obtiene la última invitación por email (la más reciente).
   * Útil para no paginar toda la lista.
   */
  async getLastInvitationByEmail(emailRaw: string) {
    const email = emailRaw.trim().toLowerCase()

    const invitation = await prisma.invitation.findFirst({
      where: { email },
      include: {
        inviter: { select: { id: true, email: true, nombres: true, apellidos: true } },
        user: { select: { id: true, email: true, profileStatus: true } },
      },
      orderBy: { createdAt: "desc" },
    })

    if (!invitation) throw new NotFoundError("Invitation not found for this email")

    return invitation
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
   * Reenvía la invitación por ID:
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
      "[Invite] resent with new temp password and user upserted",
    )
  }

  /**
   * Reenvía la invitación usando email (sin invitationId).
   * Regla: toma la invitación más reciente para ese email.
   */
  async resendInvitationByEmail(emailRaw: string, resenderId: string): Promise<void> {
    const email = emailRaw.trim().toLowerCase()

    const invitation = await prisma.invitation.findFirst({
      where: { email },
      orderBy: { createdAt: "desc" },
    })

    if (!invitation) throw new NotFoundError("Invitation not found for this email")
    if (invitation.status === "USED") throw new BadRequestError("Cannot resend a used invitation")

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

    // Actualiza ESA invitación (la más reciente)
    await prisma.invitation.update({
      where: { id: invitation.id },
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
      { invitationId: invitation.id, email, resenderId, userId: user.id, expiresAt },
      "[Invite] resent by email with new temp password and user upserted",
    )
  }
}

export const invitationService = new InvitationService()
