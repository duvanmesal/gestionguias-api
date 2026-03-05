import type { Request } from "express";

import type { InvitationStatus, RolType } from "@prisma/client";

import type {
  CreateInvitationResult,
  InvitationListFilters,
} from "./_domain/invitation.types";

import { createInvitationUsecase } from "./_usecases/create.usecase";
import { expireOldInvitationsUsecase } from "./_usecases/expireOld.usecase";
import { findValidInvitationUsecase } from "./_usecases/findValid.usecase";
import { getLastInvitationByEmailUsecase } from "./_usecases/getLastByEmail.usecase";
import { listInvitationsUsecase } from "./_usecases/list.usecase";
import { markInvitationAsUsedUsecase } from "./_usecases/markUsed.usecase";
import { resendInvitationUsecase } from "./_usecases/resend.usecase";
import { resendInvitationByEmailUsecase } from "./_usecases/resendByEmail.usecase";

/**
 * Facade del módulo Invitations.
 * Mantiene la API pública estable para NO afectar routes/.
 */
export class InvitationService {
  async createInvitation(
    req: Request,
    emailRaw: string,
    role: RolType,
    inviterId: string,
  ): Promise<CreateInvitationResult> {
    return createInvitationUsecase(req, emailRaw, role, inviterId);
  }

  async markInvitationAsUsed(
    invitationId: string,
    userId: string,
    req?: Request,
  ): Promise<void> {
    return markInvitationAsUsedUsecase(invitationId, userId, req);
  }

  async findValidInvitation(emailRaw: string) {
    return findValidInvitationUsecase(emailRaw);
  }

  async getLastInvitationByEmail(req: Request, emailRaw: string) {
    return getLastInvitationByEmailUsecase(req, emailRaw);
  }

  async expireOldInvitations(req?: Request): Promise<number> {
    return expireOldInvitationsUsecase(req);
  }

  async listInvitations(req: Request, filters?: InvitationListFilters) {
    return listInvitationsUsecase(req, filters);
  }

  async resendInvitation(
    req: Request,
    invitationId: string,
    resenderId: string,
  ): Promise<void> {
    return resendInvitationUsecase(req, invitationId, resenderId);
  }

  async resendInvitationByEmail(
    req: Request,
    emailRaw: string,
    resenderId: string,
  ): Promise<void> {
    return resendInvitationByEmailUsecase(req, emailRaw, resenderId);
  }
}

export const invitationService = new InvitationService();

export type { InvitationStatus, RolType };