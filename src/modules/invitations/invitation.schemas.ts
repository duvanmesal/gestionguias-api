import { z } from "zod"
import { RolType } from "@prisma/client"

export const createInvitationSchema = z.object({
  email: z.string().email("Invalid email format").toLowerCase(),
  role: z.nativeEnum(RolType, { errorMap: () => ({ message: "Invalid role" }) }),
})

export const resendInvitationSchema = z.object({
  invitationId: z.string().cuid("Invalid invitation ID"),
})

export type CreateInvitationRequest = z.infer<typeof createInvitationSchema>
export type ResendInvitationRequest = z.infer<typeof resendInvitationSchema>
