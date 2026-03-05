import type { Request } from "express";

import { logger } from "../../../libs/logger";

import { invitationRepository } from "../_data/invitation.repository";
import { auditOk } from "../_shared/invitation.audit";

export async function expireOldInvitationsUsecase(req?: Request): Promise<number> {
  const result = await invitationRepository.expireOldInvitations();

  if (result.count > 0) {
    logger.info({ count: result.count }, "[Invite] expired old invitations");

    if (req) {
      auditOk(
        req,
        "invitations.expireOld",
        "Expired old invitations",
        { count: result.count },
        { entity: "Invitation" },
      );
    }
  }

  return result.count;
}