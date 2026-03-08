import type { Request } from "express";
import type { RolType } from "@prisma/client";

import { logger } from "../../../libs/logger";
import { ConflictError } from "../../../libs/errors";
import { hashPassword } from "../../../libs/password";
import { sendInvitationEmail } from "../../../libs/email";

import { invitationRepository } from "../_data/invitation.repository";
import { auditFail, auditOk } from "../_shared/invitation.audit";
import {
  buildExpiresAt,
  generateInvitationToken,
  generateTempPassword,
  hashToken,
  INVITE_TTL_HOURS,
  normalizeEmail,
} from "../_domain/invitation.rules";
import type {
  CreateInvitationAction,
  CreateInvitationResult,
} from "../_domain/invitation.types";

export async function createInvitationUsecase(
  req: Request,
  emailRaw: string,
  role: RolType,
  inviterId: string,
): Promise<CreateInvitationResult> {
  const email = normalizeEmail(emailRaw);
  logger.info({ email, role, inviterId }, "[Invite] start createInvitation");

  const existingUser = await invitationRepository.findUserByEmail(email);

  if (existingUser && existingUser.profileStatus === "COMPLETE") {
    auditFail(
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

  const activeInvitation = await invitationRepository.findActivePendingInvitation(
    email,
  );

  if (activeInvitation) {
    auditFail(
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

    throw new ConflictError("An active invitation already exists for this email");
  }

  const tempPassword = generateTempPassword();
  const tempPasswordHash = await hashPassword(tempPassword);
  const token = generateInvitationToken();
  const tokenHash = hashToken(token);
  const expiresAt = buildExpiresAt();

  // DB writes (user + role profile + invitation)
  const user = await invitationRepository.upsertUserForInvitation({
    email,
    role,
    passwordHash: tempPasswordHash,
  });

  if (role === "GUIA") {
    await invitationRepository.upsertGuiaForUser(user.id);
  }

  if (role === "SUPERVISOR") {
    await invitationRepository.upsertSupervisorForUser(user.id);
  }

  const lastInvitation = await invitationRepository.findLastInvitationIdByEmail(
    email,
  );

  const action: CreateInvitationAction = lastInvitation ? "RESENT" : "CREATED";

  const invitation = lastInvitation
    ? await invitationRepository.update(lastInvitation.id, {
        role,
        tempPasswordHash,
        tokenHash,
        expiresAt,
        status: "PENDING",
        usedAt: null,
        userId: user.id,
        inviterId,
      })
    : await invitationRepository.create({
        email,
        role,
        tempPasswordHash,
        tokenHash,
        expiresAt,
        inviterId,
        status: "PENDING",
        userId: user.id,
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

  auditOk(
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

  // Send email (side effect)
  try {
    const inviter = await invitationRepository.findUserNameById(inviterId);

    await sendInvitationEmail({
      email,
      tempPassword,
      inviterName: inviter ? `${inviter.nombres} ${inviter.apellidos}` : undefined,
      expiresInHours: INVITE_TTL_HOURS,
    });

    auditOk(
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

    auditFail(
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
      await invitationRepository.updateStatus(invitation.id, "EXPIRED");
    } catch {
      // noop
    }

    throw new Error(
  error instanceof Error
    ? `Failed to send invitation email: ${error.message}`
    : "Failed to send invitation email",
);
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