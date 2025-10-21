import type { Request, Response, NextFunction } from "express"
import { invitationService } from "./invitation.service"
import { ok, created } from "../../libs/http"
import { logger } from "../../libs/logger"
import type { CreateInvitationRequest } from "./invitation.schemas"
import type { InvitationStatus } from "@prisma/client"

export class InvitationController {
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" })
      }

      const data = req.body as CreateInvitationRequest
      const result = await invitationService.createInvitation(data.email, data.role, req.user.userId)

      logger.info(
        {
          invitationId: result.invitation.id,
          email: result.invitation.email,
          role: result.invitation.role,
          inviterId: req.user.userId,
        },
        "Invitation created by admin",
      )

      // Don't return temp password in production
      const response = {
        invitation: result.invitation,
        ...(process.env.NODE_ENV === "development" && { tempPassword: result.tempPassword }),
      }

      return res.status(201).json(created(response))
    } catch (error) {
      return next(error)
    }
  }

  async list(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" })

      const { status, email } = req.query as { status?: InvitationStatus; email?: string }
      const items = await invitationService.listInvitations({
        status,
        email: email?.toLowerCase(),
      })

      return res.json(ok(items))
    } catch (error) {
      return next(error)
    }
  }


  async resend(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" })
      }

      const { invitationId } = req.params

      await invitationService.resendInvitation(invitationId, req.user.userId)

      return res.status(204).send()
    } catch (error) {
      return next(error)
    }
  }
}

export const invitationController = new InvitationController()
