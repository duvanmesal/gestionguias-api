import type { Request } from "express";
import { prisma } from "../../prisma/client";
import { hashPassword } from "../../libs/password";
import { sendInvitationEmail } from "../../libs/email";
import { logger } from "../../libs/logger";
import {
  ConflictError,
  NotFoundError,
  BadRequestError,
} from "../../libs/errors";
import { logsService } from "../../libs/logs/logs.service";
import type { RolType, InvitationStatus } from "@prisma/client";
import crypto from "crypto";

const INVITE_TTL_HOURS = Number.parseInt(
  process.env.INVITE_TTL_HOURS || "24",
  10,
);
const PASSWORD_PEPPER = process.env.PASSWORD_PEPPER || "";

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
  let password = "";
  const randomBytes = crypto.randomBytes(12);
  for (let i = 0; i < 12; i++) password += chars[randomBytes[i] % chars.length];
  return password;
}

function generateInvitationToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function hashToken(token: string): string {
  return crypto
    .createHmac("sha256", PASSWORD_PEPPER)
    .update(token)
    .digest("hex");
}

export type CreateInvitationAction = "CREATED" | "RESENT";

export interface CreateInvitationResult {
  action: CreateInvitationAction;
  invitation: {
    id: string;
    email: string;
    role: RolType;
    expiresAt: Date;
    status: InvitationStatus;
  };
  tempPassword: string;
}

function auditWarn(
  req: Request,
  event: string,
  message: string,
  meta?: Record<string, any>,
  target?: any,
) {
  logsService.audit(req, { event, level: "warn", message, meta, target });
}

function auditInfo(
  req: Request,
  event: string,
  message: string,
  meta?: Record<string, any>,
  target?: any,
) {
  logsService.audit(req, { event, message, meta, target });
}

export class InvitationService {
  async createInvitation(
    req: Request,
    emailRaw: string,
    role: RolType,
    inviterId: string,
  ): Promise<CreateInvitationResult> {
    const email = emailRaw.trim().toLowerCase();
    logger.info({ email, role, inviterId }, "[Invite] start createInvitation");

    const existingUser = await prisma.usuario.findUnique({
      where: { email },
      select: { id: true, profileStatus: true },
    });

    if (existingUser && existingUser.profileStatus === "COMPLETE") {
      auditWarn(
        req,
        "invitations.create.failed",
        "Create invitation failed",
        {
          reason: "user_complete_exists",
          email,
          userId: existingUser.id,
        },
        { entity: "User", id: existingUser.id },
      );
      logger.warn(
        { email, userId: existingUser.id },
        "[Invite] user exists and is COMPLETE",
      );
      throw new ConflictError("User with this email already exists");
    }

    const activeInvitation = await prisma.invitation.findFirst({
      where: { email, status: "PENDING", expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });

    if (activeInvitation) {
      auditWarn(
        req,
        "invitations.create.failed",
        "Create invitation failed",
        {
          reason: "active_invitation_exists",
          email,
          invitationId: activeInvitation.id,
          expiresAt: activeInvitation.expiresAt?.toISOString?.(),
        },
        { entity: "Invitation", id: activeInvitation.id },
      );
      logger.warn(
        { email, invitationId: activeInvitation.id },
        "[Invite] active invitation already exists",
      );
      throw new ConflictError(
        "An active invitation already exists for this email",
      );
    }

    const tempPassword = generateTempPassword();
    const tempPasswordHash = await hashPassword(tempPassword);
    const token = generateInvitationToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 60 * 60 * 1000);

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
    });

    if (role === "GUIA") {
      await prisma.guia.upsert({
        where: { usuarioId: user.id },
        create: { usuarioId: user.id },
        update: {},
      });
    }

    if (role === "SUPERVISOR") {
      await prisma.supervisor.upsert({
        where: { usuarioId: user.id },
        create: { usuarioId: user.id },
        update: {},
      });
    }

    const lastInvitation = await prisma.invitation.findFirst({
      where: { email },
      orderBy: { createdAt: "desc" },
    });

    const action: CreateInvitationAction = lastInvitation
      ? "RESENT"
      : "CREATED";

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
        });

    logger.info(
      {
        email,
        role,
        inviterId,
        invitationId: invitation.id,
        userId: user.id,
        expiresAt,
        action,
      },
      "[Invite] invite-or-resend completed",
    );

    auditInfo(
      req,
      "invitations.create.success",
      "Invitation created or resent",
      {
        action,
        invitationId: invitation.id,
        email,
        role,
        expiresAt: expiresAt.toISOString(),
        inviterId,
        userId: user.id,
      },
      { entity: "Invitation", id: invitation.id },
    );

    try {
      const inviter = await prisma.usuario.findUnique({
        where: { id: inviterId },
        select: { nombres: true, apellidos: true },
      });

      await sendInvitationEmail({
        email,
        tempPassword,
        inviterName: inviter
          ? `${inviter.nombres} ${inviter.apellidos}`
          : undefined,
        expiresInHours: INVITE_TTL_HOURS,
      });

      auditInfo(
        req,
        "invitations.email.sent",
        "Invitation email sent",
        {
          invitationId: invitation.id,
          email,
          role,
          inviterId,
        },
        { entity: "Invitation", id: invitation.id },
      );

      logger.info(
        { invitationId: invitation.id, email, role, inviterId },
        "[Invite] email sent",
      );
    } catch (error) {
      logger.error(
        {
          invitationId: invitation.id,
          email,
          userId: user.id,
          err: (error as Error)?.message,
        },
        "[Invite] email failed; marking invitation as EXPIRED",
      );

      auditWarn(
        req,
        "invitations.email.failed",
        "Invitation email failed",
        {
          invitationId: invitation.id,
          email,
          error: (error as Error)?.message,
        },
        { entity: "Invitation", id: invitation.id },
      );

      try {
        await prisma.invitation.update({
          where: { id: invitation.id },
          data: { status: "EXPIRED" },
        });
      } catch {}

      throw new Error("Failed to send invitation email");
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
    };
  }

  async markInvitationAsUsed(
    invitationId: string,
    userId: string,
    req?: Request,
  ): Promise<void> {
    await prisma.invitation.update({
      where: { id: invitationId },
      data: { status: "USED", usedAt: new Date(), userId },
    });
    if (req) {
      auditInfo(
        req,
        "invitations.markUsed",
        "Invitation marked as used",
        {
          invitationId,
          userId,
        },
        { entity: "Invitation", id: invitationId },
      );
    }
    logger.info({ invitationId, userId }, "[Invite] marked as used");
  }

  async findValidInvitation(emailRaw: string) {
    const email = emailRaw.toLowerCase();
    return prisma.invitation.findFirst({
      where: { email, status: "PENDING", expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
  }

  async getLastInvitationByEmail(req: Request, emailRaw: string) {
    const email = emailRaw.trim().toLowerCase();

    const invitation = await prisma.invitation.findFirst({
      where: { email },
      include: {
        inviter: {
          select: { id: true, email: true, nombres: true, apellidos: true },
        },
        user: { select: { id: true, email: true, profileStatus: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!invitation) {
      auditWarn(
        req,
        "invitations.getLastByEmail.failed",
        "Get last invitation failed",
        {
          reason: "not_found",
          email,
        },
        { entity: "Invitation" },
      );
      throw new NotFoundError("Invitation not found for this email");
    }

    auditInfo(
      req,
      "invitations.getLastByEmail",
      "Get last invitation by email",
      {
        invitationId: invitation.id,
        email,
        status: invitation.status,
        expiresAt: invitation.expiresAt?.toISOString?.(),
      },
      { entity: "Invitation", id: invitation.id },
    );

    return invitation;
  }

  async expireOldInvitations(req?: Request): Promise<number> {
    const result = await prisma.invitation.updateMany({
      where: { status: "PENDING", expiresAt: { lte: new Date() } },
      data: { status: "EXPIRED" },
    });
    if (result.count > 0) {
      logger.info({ count: result.count }, "[Invite] expired old invitations");
      if (req) {
        auditInfo(
          req,
          "invitations.expireOld",
          "Expired old invitations",
          {
            count: result.count,
          },
          { entity: "Invitation" },
        );
      }
    }
    return result.count;
  }

  async listInvitations(
    req: Request,
    filters?: { status?: InvitationStatus; email?: string },
  ) {
    const where = {
      ...(filters?.status ? { status: filters.status } : {}),
      ...(filters?.email ? { email: filters.email.toLowerCase() } : {}),
    };

    const items = await prisma.invitation.findMany({
      where,
      include: {
        inviter: {
          select: { id: true, email: true, nombres: true, apellidos: true },
        },
        user: { select: { id: true, email: true, profileStatus: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    auditInfo(
      req,
      "invitations.list",
      "List invitations",
      {
        status: filters?.status ?? null,
        email: filters?.email ?? null,
        returned: items.length,
      },
      { entity: "Invitation" },
    );

    return items;
  }

  async resendInvitation(
    req: Request,
    invitationId: string,
    resenderId: string,
  ): Promise<void> {
    const invitation = await prisma.invitation.findUnique({
      where: { id: invitationId },
    });
    if (!invitation) {
      auditWarn(
        req,
        "invitations.resend.failed",
        "Resend invitation failed",
        {
          reason: "not_found",
          invitationId,
        },
        { entity: "Invitation", id: invitationId },
      );
      throw new NotFoundError("Invitation not found");
    }
    if (invitation.status === "USED") {
      auditWarn(
        req,
        "invitations.resend.failed",
        "Resend invitation failed",
        {
          reason: "already_used",
          invitationId,
        },
        { entity: "Invitation", id: invitationId },
      );
      throw new BadRequestError("Cannot resend a used invitation");
    }

    const email = invitation.email.toLowerCase();
    const tempPassword = generateTempPassword();
    const tempPasswordHash = await hashPassword(tempPassword);
    const token = generateInvitationToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 60 * 60 * 1000);

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
    });

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
    });

    const resender = await prisma.usuario.findUnique({
      where: { id: resenderId },
      select: { nombres: true, apellidos: true },
    });

    await sendInvitationEmail({
      email,
      tempPassword,
      inviterName: resender
        ? `${resender.nombres} ${resender.apellidos}`
        : undefined,
      expiresInHours: INVITE_TTL_HOURS,
    });

    auditInfo(
      req,
      "invitations.resend.success",
      "Invitation resent",
      {
        invitationId,
        email,
        resenderId,
        userId: user.id,
        expiresAt: expiresAt.toISOString(),
      },
      { entity: "Invitation", id: invitationId },
    );

    logger.info(
      { invitationId, email, resenderId, userId: user.id, expiresAt },
      "[Invite] resent with new temp password and user upserted",
    );
  }

  async resendInvitationByEmail(
    req: Request,
    emailRaw: string,
    resenderId: string,
  ): Promise<void> {
    const email = emailRaw.trim().toLowerCase();

    const invitation = await prisma.invitation.findFirst({
      where: { email },
      orderBy: { createdAt: "desc" },
    });

    if (!invitation) {
      auditWarn(
        req,
        "invitations.resendByEmail.failed",
        "Resend-by-email failed",
        {
          reason: "not_found",
          email,
        },
        { entity: "Invitation" },
      );
      throw new NotFoundError("Invitation not found for this email");
    }
    if (invitation.status === "USED") {
      auditWarn(
        req,
        "invitations.resendByEmail.failed",
        "Resend-by-email failed",
        {
          reason: "already_used",
          invitationId: invitation.id,
          email,
        },
        { entity: "Invitation", id: invitation.id },
      );
      throw new BadRequestError("Cannot resend a used invitation");
    }

    const tempPassword = generateTempPassword();
    const tempPasswordHash = await hashPassword(tempPassword);
    const token = generateInvitationToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 60 * 60 * 1000);

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
    });

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
    });

    const resender = await prisma.usuario.findUnique({
      where: { id: resenderId },
      select: { nombres: true, apellidos: true },
    });

    await sendInvitationEmail({
      email,
      tempPassword,
      inviterName: resender
        ? `${resender.nombres} ${resender.apellidos}`
        : undefined,
      expiresInHours: INVITE_TTL_HOURS,
    });

    auditInfo(
      req,
      "invitations.resendByEmail.success",
      "Invitation resent by email",
      {
        invitationId: invitation.id,
        email,
        resenderId,
        userId: user.id,
        expiresAt: expiresAt.toISOString(),
      },
      { entity: "Invitation", id: invitation.id },
    );

    logger.info(
      {
        invitationId: invitation.id,
        email,
        resenderId,
        userId: user.id,
        expiresAt,
      },
      "[Invite] resent by email with new temp password and user upserted",
    );
  }
}

export const invitationService = new InvitationService();
