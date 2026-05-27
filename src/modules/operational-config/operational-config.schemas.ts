import { TurnoAssignmentMode } from "@prisma/client"
import { z } from "zod"

import {
  PENALTY_DURATION_MAX_HOURS,
  PENALTY_DURATION_MIN_HOURS,
} from "../penalties/penalty.service"

export const updateTurnoAssignmentModeSchema = z.object({
  mode: z.nativeEnum(TurnoAssignmentMode, {
    errorMap: () => ({ message: "Modo de asignación inválido" }),
  }),
})

export const updateNoShowPenaltyDurationSchema = z.object({
  durationHours: z
    .number({
      invalid_type_error: "durationHours debe ser un entero entre 1 y 720",
    })
    .int("durationHours debe ser entero")
    .min(PENALTY_DURATION_MIN_HOURS, `Mínimo ${PENALTY_DURATION_MIN_HOURS} hora`)
    .max(PENALTY_DURATION_MAX_HOURS, `Máximo ${PENALTY_DURATION_MAX_HOURS} horas`),
})

export type UpdateTurnoAssignmentModeBody = z.infer<typeof updateTurnoAssignmentModeSchema>
export type UpdateNoShowPenaltyDurationBody = z.infer<typeof updateNoShowPenaltyDurationSchema>
