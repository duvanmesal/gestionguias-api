import { z } from "zod"
import { StatusType } from "@prisma/client"

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})

export const listPuertoQuerySchema = z.object({
  q: z.string().trim().min(1).max(80).optional(),
  paisId: z.coerce.number().int().positive().optional(),
  status: z.nativeEnum(StatusType).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(10),
})

export const createPuertoSchema = z.object({
  codigo: z.string().trim().min(2).max(20),
  nombre: z.string().trim().min(2).max(120),
  ciudad: z.string().trim().min(2).max(120),
  paisId: z.coerce.number().int().positive(),
  status: z.nativeEnum(StatusType).optional(),
})

export const updatePuertoSchema = z
  .object({
    codigo: z.string().trim().min(2).max(20).optional(),
    nombre: z.string().trim().min(2).max(120).optional(),
    ciudad: z.string().trim().min(2).max(120).optional(),
    paisId: z.coerce.number().int().positive().optional(),
    status: z.nativeEnum(StatusType).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "Debe enviar al menos un campo para actualizar",
  })

export type IdParam = z.infer<typeof idParamSchema>
export type ListPuertoQuery = z.infer<typeof listPuertoQuerySchema>
export type CreatePuertoBody = z.infer<typeof createPuertoSchema>
export type UpdatePuertoBody = z.infer<typeof updatePuertoSchema>
