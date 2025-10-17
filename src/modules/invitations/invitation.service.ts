import { prisma } from "../../prisma/client"
import { hashPassword } from "../../libs/password"
import { sendInvitationEmail } from "../../libs/email"
import { logger } from "../../libs/logger"
import { ConflictError, NotFoundError, BadRequestError } from "../../libs/errors"
import type { RolType, InvitationStatus } from "@prisma/client"
import crypto from "crypto"

const INVITE_TTL_HOURS = Number.parseInt(process.env.INVITE_TTL_HOURS || "24", 10)
const PASSWORD_PEPPER = process.env.PASSWORD_PEPPER || ""

function generateTempPassword(): string {
  // Generate a secure 12-character temporary password
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%"
  let password = ""
  const randomBytes = crypto.randomBytes(12)

  for (let i = 0; i < 12; i++) {
    password += chars[randomBytes[i] % chars.length]
  }

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
  tempPassword: string
}

export class InvitationService {
  async createInvitation(email: string, role: RolType, inviterId: string): Promise<CreateInvitationResult> {
    // Check if user already exists
    const existingUser = await prisma.usuario.findUnique({
      where: { email },
    })

    if (existingUser) {
      throw new ConflictError("User with this email already exists")
    }

    // Check for pending invitations
    const pendingInvitation = await prisma.invitation.findFirst({
      where: {
        email,
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
    })

    if (pendingInvitation) {
      throw new ConflictError("An active invitation already exists for this email")
    }

    // Generate temp password and token
    const tempPassword = generateTempPassword()
    const tempPasswordHash = await hashPassword(tempPassword)

    const token = generateInvitationToken()
    const tokenHash = hashToken(token)

    const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 60 * 60 * 1000)

    // Create invitation
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

    // Get inviter info for email
    const inviter = await prisma.usuario.findUnique({
      where: { id: inviterId },
      select: { nombres: true, apellidos: true },
    })

    // Send invitation email
    try {
      await sendInvitationEmail({
        email,
        tempPassword,
        inviterName: inviter ? `${inviter.nombres} ${inviter.apellidos}` : undefined,
        expiresInHours: INVITE_TTL_HOURS,
      })

      logger.info(
        {
          invitationId: invitation.id,
          email,
          role,
          inviterId,
          expiresAt,
        },
        "Invitation created and email sent",
      )
    } catch (error) {
      // Rollback invitation if email fails
      await prisma.invitation.delete({ where: { id: invitation.id } })
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
      tempPassword, // Return for testing purposes only
    }
  }

  async markInvitationAsUsed(invitationId: string, userId: string): Promise<void> {
    await prisma.invitation.update({
      where: { id: invitationId },
      data: {
        status: "USED",
        usedAt: new Date(),
        userId,
      },
    })

    logger.info({ invitationId, userId }, "Invitation marked as used")
  }

  async findValidInvitation(email: string) {
    return prisma.invitation.findFirst({
      where: {
        email,
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    })
  }

  async expireOldInvitations(): Promise<number> {
    const result = await prisma.invitation.updateMany({
      where: {
        status: "PENDING",
        expiresAt: { lte: new Date() },
      },
      data: {
        status: "EXPIRED",
      },
    })

    if (result.count > 0) {
      logger.info({ count: result.count }, "Expired old invitations")
    }

    return result.count
  }

  async listInvitations(filters?: {
    status?: InvitationStatus
    email?: string
  }) {
    return prisma.invitation.findMany({
      where: filters,
      include: {
        inviter: {
          select: {
            id: true,
            email: true,
            nombres: true,
            apellidos: true,
          },
        },
        user: {
          select: {
            id: true,
            email: true,
            profileStatus: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    })
  }

  async resendInvitation(invitationId: string, resenderId: string): Promise<void> {
    const invitation = await prisma.invitation.findUnique({
      where: { id: invitationId },
    })

    if (!invitation) {
      throw new NotFoundError("Invitation not found")
    }

    if (invitation.status === "USED") {
      throw new BadRequestError("Cannot resend a used invitation")
    }

    // Check if user was created
    const existingUser = await prisma.usuario.findUnique({
      where: { email: invitation.email },
    })

    if (existingUser) {
      throw new ConflictError("User already exists, cannot resend invitation")
    }

    // Generate new temp password
    const tempPassword = generateTempPassword()
    const tempPasswordHash = await hashPassword(tempPassword)

    const token = generateInvitationToken()
    const tokenHash = hashToken(token)

    const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 60 * 60 * 1000)

    // Update invitation
    await prisma.invitation.update({
      where: { id: invitationId },
      data: {
        tempPasswordHash,
        tokenHash,
        expiresAt,
        status: "PENDING",
        usedAt: null,
      },
    })

    // Get resender info
    const resender = await prisma.usuario.findUnique({
      where: { id: resenderId },
      select: { nombres: true, apellidos: true },
    })

    // Send email
    await sendInvitationEmail({
      email: invitation.email,
      tempPassword,
      inviterName: resender ? `${resender.nombres} ${resender.apellidos}` : undefined,
      expiresInHours: INVITE_TTL_HOURS,
    })

    logger.info(
      {
        invitationId,
        email: invitation.email,
        resenderId,
      },
      "Invitation resent",
    )
  }
}

export const invitationService = new InvitationService()
