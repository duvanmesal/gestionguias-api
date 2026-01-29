import { z } from "zod"
import { RolType } from "@prisma/client"

export const createInvitationSchema = z.object({
  email: z.string().email("Invalid email format").toLowerCase(),
  role: z.nativeEnum(RolType, { errorMap: () => ({ message: "Invalid role" }) }),
})

export const resendInvitationSchema = z.object({
  invitationId: z.string().cuid("Invalid invitation ID"),
})

/**
 * POST /invitations/resend-by-email
 * Body: { email }
 */
export const resendByEmailSchema = z.object({
  email: z.string().email("Invalid email format").toLowerCase(),
})

/**
 * GET /invitations/by-email/:email
 * Params: { email }
 */
export const getInvitationByEmailParamsSchema = z.object({
  email: z.string().email("Invalid email format").toLowerCase(),
})

export type CreateInvitationRequest = z.infer<typeof createInvitationSchema>
export type ResendInvitationRequest = z.infer<typeof resendInvitationSchema>
export type ResendByEmailRequest = z.infer<typeof resendByEmailSchema>
export type GetInvitationByEmailParams = z.infer<typeof getInvitationByEmailParamsSchema>
