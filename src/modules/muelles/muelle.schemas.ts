import { z } from "zod"
import { StatusType } from "@prisma/client"

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})

export const listMuelleQuerySchema = z.object({
  q: z.string().trim().min(1).max(80).optional(),
  puertoId: z.coerce.number().int().positive().optional(),
  status: z.nativeEnum(StatusType).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(10),
})

export const lookupMuelleQuerySchema = z.object({
  puertoId: z.coerce.number().int().positive().optional(),
})

export const createMuelleSchema = z.object({
  codigo: z.string().trim().min(2).max(20),
  nombre: z.string().trim().min(2).max(120),
  puertoId: z.coerce.number().int().positive(),
  capacidadCruceros: z.coerce.number().int().positive().max(50).optional(),
  status: z.nativeEnum(StatusType).optional(),
})

export const updateMuelleSchema = z
  .object({
    codigo: z.string().trim().min(2).max(20).optional(),
    nombre: z.string().trim().min(2).max(120).optional(),
    puertoId: z.coerce.number().int().positive().optional(),
    capacidadCruceros: z.coerce.number().int().positive().max(50).nullable().optional(),
    status: z.nativeEnum(StatusType).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "Debe enviar al menos un campo para actualizar",
  })

export type IdParam = z.infer<typeof idParamSchema>
export type ListMuelleQuery = z.infer<typeof listMuelleQuerySchema>
export type LookupMuelleQuery = z.infer<typeof lookupMuelleQuerySchema>
export type CreateMuelleBody = z.infer<typeof createMuelleSchema>
export type UpdateMuelleBody = z.infer<typeof updateMuelleSchema>
