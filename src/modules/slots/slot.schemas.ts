import { z } from "zod"
import { StatusType } from "@prisma/client"

export const listSlotsQuerySchema = z.object({}).strict()

export const slotNumeroParamSchema = z.object({
  numero: z.coerce.number().int().min(1).max(4),
})

export const slotIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})

export const toggleSlotBodySchema = z
  .object({
    status: z.nativeEnum(StatusType),
    motivoInactividad: z.string().trim().max(500).optional().nullable(),
  })
  .strict()

export type ListSlotsQuery = z.infer<typeof listSlotsQuerySchema>
export type SlotNumeroParam = z.infer<typeof slotNumeroParamSchema>
export type SlotIdParam = z.infer<typeof slotIdParamSchema>
export type ToggleSlotBody = z.infer<typeof toggleSlotBodySchema>
