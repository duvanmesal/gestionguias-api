import type { Request } from "express";

import { NotFoundError } from "../../../libs/errors";

import { invitationRepository } from "../_data/invitation.repository";
import { auditFail, auditOk } from "../_shared/invitation.audit";
import { normalizeEmail } from "../_domain/invitation.rules";

export async function getLastInvitationByEmailUsecase(
  req: Request,
  emailRaw: string,
) {
  const email = normalizeEmail(emailRaw);

  const invitation = await invitationRepository.findLastInvitationByEmailDetailed(
    email,
  );

  if (!invitation) {
    auditFail(
      req,
      "invitations.getLastByEmail.failed",
      "Get last invitation failed",
      { reason: "not_found", email },
      { entity: "Invitation" },
    );

    throw new NotFoundError("Invitation not found for this email");
  }

  auditOk(
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