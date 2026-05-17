import { TurnoAssignmentMode } from "@prisma/client"
import { z } from "zod"

export const updateTurnoAssignmentModeSchema = z.object({
  mode: z.nativeEnum(TurnoAssignmentMode, {
    errorMap: () => ({ message: "Modo de asignación inválido" }),
  }),
})

export type UpdateTurnoAssignmentModeBody = z.infer<typeof updateTurnoAssignmentModeSchema>
