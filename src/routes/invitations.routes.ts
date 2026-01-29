import { Router } from "express"
import { invitationController } from "../modules/invitations/invitation.controller"
import { requireAuth } from "../libs/auth"
import { requireRoles } from "../libs/rbac"
import { validate } from "../libs/zod-mw"
import {
  createInvitationSchema,
  resendInvitationSchema,
  resendByEmailSchema,
  getInvitationByEmailParamsSchema,
} from "../modules/invitations/invitation.schemas"
import { RolType } from "@prisma/client"

const router = Router()

// All invitation routes require authentication
router.use(requireAuth)

// Only SUPER_ADMIN can manage invitations
router.post(
  "/",
  requireRoles(RolType.SUPER_ADMIN),
  validate({ body: createInvitationSchema }),
  invitationController.create
)

router.get(
  "/",
  requireRoles(RolType.SUPER_ADMIN),
  invitationController.list
)

router.post(
  "/:invitationId/resend",
  requireRoles(RolType.SUPER_ADMIN),
  validate({ params: resendInvitationSchema }),
  invitationController.resend
)

// Resend invitation by email (no invitationId needed)
router.post(
  "/resend-by-email",
  requireRoles(RolType.SUPER_ADMIN),
  validate({ body: resendByEmailSchema }),
  invitationController.resendByEmail
)

// Get last invitation by email (no pagination)
router.get(
  "/by-email/:email",
  requireRoles(RolType.SUPER_ADMIN),
  validate({ params: getInvitationByEmailParamsSchema }),
  invitationController.getLastByEmail
)

export { router as invitationRoutes }
