import type { Request, Response, NextFunction } from "express"
import { invitationService } from "./invitation.service"
import { ok, created } from "../../libs/http"
import { logger } from "../../libs/logger"
import { logsService } from "../../libs/logs/logs.service"
import type {
  CreateInvitationRequest,
  ResendByEmailRequest,
  GetInvitationByEmailParams,
} from "./invitation.schemas"
import type { InvitationStatus } from "@prisma/client"

export class InvitationController {
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" })

      const data = req.body as CreateInvitationRequest
      const result = await invitationService.createInvitation(
        req,
        data.email,
        data.role,
        req.user.userId,
      )

      logger.info(
        {
          action: result.action,
          invitationId: result.invitation.id,
          email: result.invitation.email,
          role: result.invitation.role,
          inviterId: req.user.userId,
        },
        "Invitation create (invite-or-resend) by admin",
      )

      logsService.audit(req, {
        event: "invitations.create.http_ok",
        target: { entity: "Invitation", id: result.invitation.id },
        meta: {
          action: result.action,
          email: result.invitation.email,
          role: result.invitation.role,
          status: result.invitation.status,
          expiresAt: result.invitation.expiresAt,
        },
        message: "Invitation create response sent",
      })

      const response = {
        action: result.action,
        invitation: result.invitation,
        ...(process.env.NODE_ENV === "development" && { tempPassword: result.tempPassword }),
      }

      if (result.action === "CREATED") {
        return res.status(201).json(created(response))
      }

      return res.status(200).json(ok(response))
    } catch (error) {
      return next(error)
    }
  }

  async list(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" })

      const { status, email } = req.query as { status?: InvitationStatus; email?: string }
      const items = await invitationService.listInvitations(req, {
        status,
        email: email?.toLowerCase(),
      })

      logsService.audit(req, {
        event: "invitations.list.http_ok",
        target: { entity: "Invitation" },
        meta: { returned: items.length, status: status ?? null, email: email ?? null },
        message: "Invitation list response sent",
      })

      return res.json(ok(items))
    } catch (error) {
      return next(error)
    }
  }

  async resend(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" })

      const { invitationId } = req.params
      await invitationService.resendInvitation(req, invitationId, req.user.userId)

      logsService.audit(req, {
        event: "invitations.resend.http_ok",
        target: { entity: "Invitation", id: invitationId },
        message: "Invitation resend response sent",
      })

      return res.status(204).send()
    } catch (error) {
      return next(error)
    }
  }

  async resendByEmail(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" })

      const data = req.body as ResendByEmailRequest
      await invitationService.resendInvitationByEmail(req, data.email, req.user.userId)

      logsService.audit(req, {
        event: "invitations.resendByEmail.http_ok",
        target: { entity: "Invitation" },
        meta: { email: data.email?.toLowerCase() },
        message: "Invitation resend-by-email response sent",
      })

      return res.status(204).send()
    } catch (error) {
      return next(error)
    }
  }

  async getLastByEmail(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" })

      const { email } = req.params as unknown as GetInvitationByEmailParams
      const invitation = await invitationService.getLastInvitationByEmail(req, email)

      logsService.audit(req, {
        event: "invitations.getLastByEmail.http_ok",
        target: { entity: "Invitation", id: invitation?.id },
        meta: { email: email?.toLowerCase() },
        message: "Invitation get-last-by-email response sent",
      })

      return res.json(ok(invitation))
    } catch (error) {
      return next(error)
    }
  }
}

export const invitationController = new InvitationController()