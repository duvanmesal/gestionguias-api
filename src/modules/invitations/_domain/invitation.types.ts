import type { InvitationStatus, RolType } from "@prisma/client";

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
  /**
   * La contraseña temporal (solo debe exponerse en dev; en prod solo se envía por email).
   */
  tempPassword: string;
}

export type InvitationListFilters = {
  status?: InvitationStatus;
  email?: string;
};