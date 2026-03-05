import type { Request } from "express";

import { logger } from "../../../libs/logger";

import { invitationRepository } from "../_data/invitation.repository";
import { auditOk } from "../_shared/invitation.audit";

export async function markInvitationAsUsedUsecase(
  invitationId: string,
  userId: string,
  req?: Request,
): Promise<void> {
  const when = new Date();

  await invitationRepository.markUsed(invitationId, userId, when);

  if (req) {
    auditOk(
      req,
      "invitations.markUsed",
      "Invitation marked as used",
      { invitationId, userId },
      { entity: "Invitation", id: invitationId },
    );
  }

  logger.info({ invitationId, userId }, "[Invite] marked as used");
}