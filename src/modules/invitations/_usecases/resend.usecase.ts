import type { Request } from "express";

import { BadRequestError, NotFoundError } from "../../../libs/errors";
import { logger } from "../../../libs/logger";
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
} from "../_domain/invitation.rules";

export async function resendInvitationUsecase(
  req: Request,
  invitationId: string,
  resenderId: string,
): Promise<void> {
  const invitation = await invitationRepository.findById(invitationId);

  if (!invitation) {
    auditFail(
      req,
      "invitations.resend.failed",
      "Resend invitation failed",
      { reason: "not_found", invitationId },
      { entity: "Invitation", id: invitationId },
    );
    throw new NotFoundError("Invitation not found");
  }

  if (invitation.status === "USED") {
    auditFail(
      req,
      "invitations.resend.failed",
      "Resend invitation failed",
      { reason: "already_used", invitationId },
      { entity: "Invitation", id: invitationId },
    );
    throw new BadRequestError("Cannot resend a used invitation");
  }

  const email = invitation.email.toLowerCase();
  const tempPassword = generateTempPassword();
  const tempPasswordHash = await hashPassword(tempPassword);
  const token = generateInvitationToken();
  const tokenHash = hashToken(token);
  const expiresAt = buildExpiresAt();

  const user = await invitationRepository.upsertUserForResend({
    email,
    role: invitation.role,
    passwordHash: tempPasswordHash,
  });

  await invitationRepository.update(invitationId, {
    tempPasswordHash,
    tokenHash,
    expiresAt,
    status: "PENDING",
    usedAt: null,
    ...(invitation.userId ? {} : { userId: user.id }),
  });

  const resender = await invitationRepository.findUserNameById(resenderId);

  await sendInvitationEmail({
    email,
    tempPassword,
    inviterName: resender ? `${resender.nombres} ${resender.apellidos}` : undefined,
    expiresInHours: INVITE_TTL_HOURS,
  });

  auditOk(
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