import { z } from 'zod'
import { StatusType } from '@prisma/client'

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})

export const listPaisQuerySchema = z.object({
  q: z.string().trim().min(1).max(60).optional(),
  codigo: z.string().trim().min(2).max(10).optional(),
  status: z.nativeEnum(StatusType).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(10),
})

export const createPaisSchema = z.object({
  codigo: z.string().trim().min(2).max(10),
  nombre: z.string().trim().min(2),
  status: z.nativeEnum(StatusType).optional(),
})

export const updatePaisSchema = z.object({
  codigo: z.string().trim().min(2).max(10).optional(),
  nombre: z.string().trim().min(2).optional(),
  status: z.nativeEnum(StatusType).optional(),
})
