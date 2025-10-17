import { Router } from "express"
import { invitationController } from "../modules/invitations/invitation.controller"
import { requireAuth } from "../libs/auth"
import { requireRoles } from "../libs/rbac"
import { validate } from "../libs/zod-mw"
import { createInvitationSchema } from "../modules/invitations/invitation.schemas"
import { RolType } from "@prisma/client"

const router = Router()

// All invitation routes require authentication
router.use(requireAuth)

// Only SUPER_ADMIN can manage invitations
// src/routes/invitations.routes.ts
router.post(
  "/",
  requireRoles(RolType.SUPER_ADMIN),
  validate({ body: createInvitationSchema }),
  invitationController.create
);

router.get(
  "/",
  requireRoles(RolType.SUPER_ADMIN),
  invitationController.list
);

router.post(
  "/:invitationId/resend",
  requireRoles(RolType.SUPER_ADMIN),
  invitationController.resend
);



export { router as invitationRoutes }
