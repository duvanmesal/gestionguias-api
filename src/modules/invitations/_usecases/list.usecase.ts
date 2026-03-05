import type { Request } from "express";

import { auditOk } from "../_shared/invitation.audit";
import { invitationRepository } from "../_data/invitation.repository";
import type { InvitationListFilters } from "../_domain/invitation.types";

export async function listInvitationsUsecase(
  req: Request,
  filters?: InvitationListFilters,
) {
  const where = {
    ...(filters?.status ? { status: filters.status } : {}),
    ...(filters?.email ? { email: filters.email.toLowerCase() } : {}),
  };

  const items = await invitationRepository.list(where);

  auditOk(
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