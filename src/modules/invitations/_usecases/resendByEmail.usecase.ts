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
  normalizeEmail,
} from "../_domain/invitation.rules";

export async function resendInvitationByEmailUsecase(
  req: Request,
  emailRaw: string,
  resenderId: string,
): Promise<void> {
  const email = normalizeEmail(emailRaw);

  const last = await invitationRepository.findLastInvitationIdByEmail(email);

  if (!last) {
    auditFail(
      req,
      "invitations.resendByEmail.failed",
      "Resend-by-email failed",
      { reason: "not_found", email },
      { entity: "Invitation" },
    );
    throw new NotFoundError("Invitation not found for this email");
  }

  const invitation = await invitationRepository.findById(last.id);

  if (!invitation) {
    // Teóricamente no pasa, pero lo dejamos claro.
    auditFail(
      req,
      "invitations.resendByEmail.failed",
      "Resend-by-email failed",
      { reason: "not_found", email, invitationId: last.id },
      { entity: "Invitation", id: last.id },
    );
    throw new NotFoundError("Invitation not found for this email");
  }

  if (invitation.status === "USED") {
    auditFail(
      req,
      "invitations.resendByEmail.failed",
      "Resend-by-email failed",
      { reason: "already_used", invitationId: invitation.id, email },
      { entity: "Invitation", id: invitation.id },
    );
    throw new BadRequestError("Cannot resend a used invitation");
  }

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

  await invitationRepository.update(invitation.id, {
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