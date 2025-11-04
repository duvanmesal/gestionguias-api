import { z } from 'zod'
import { StatusType } from '@prisma/client'

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})

export const listBuqueQuerySchema = z.object({
  q: z.string().trim().min(1).max(60).optional(),
  paisId: z.coerce.number().int().positive().optional(),
  status: z.nativeEnum(StatusType).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(10),
})

export const createBuqueSchema = z.object({
  nombre: z.string().trim().min(2),
  // tu schema actual tiene paisId como Int? (opcional)
  paisId: z.coerce.number().int().positive().optional(),
  capacidad: z.coerce.number().int().positive().max(200000).optional(),
  naviera: z.string().trim().min(2).max(80).optional(),
  status: z.nativeEnum(StatusType).optional(),
})

export const updateBuqueSchema = z.object({
  nombre: z.string().trim().min(2).optional(),
  paisId: z.coerce.number().int().positive().optional(),
  capacidad: z.coerce.number().int().positive().max(200000).optional(),
  naviera: z.string().trim().min(2).max(80).optional(),
  status: z.nativeEnum(StatusType).optional(),
})
