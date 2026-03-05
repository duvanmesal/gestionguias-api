import { z } from "zod";
import { StatusType } from "@prisma/client";

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const listPaisQuerySchema = z.object({
  q: z.string().trim().min(1).max(60).optional(),
  codigo: z.string().trim().min(2).max(10).optional(),
  status: z.nativeEnum(StatusType).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(10),
});

export const createPaisSchema = z.object({
  codigo: z.string().trim().min(2).max(10),
  nombre: z.string().trim().min(2),
  status: z.nativeEnum(StatusType).optional(),
});

export const updatePaisSchema = z.object({
  codigo: z.string().trim().min(2).max(10).optional(),
  nombre: z.string().trim().min(2).optional(),
  status: z.nativeEnum(StatusType).optional(),
});

export const bulkUploadModeSchema = z.enum(["UPSERT", "CREATE_ONLY"]);
export type BulkUploadMode = z.infer<typeof bulkUploadModeSchema>;

export const bulkPaisItemInputSchema = z
  .object({
    codigo: z.string().trim().max(10).optional(),
    nombre: z.string().trim().optional(),
    status: z.nativeEnum(StatusType).optional(),
  })
  .strict();

export const bulkPaisRequestSchema = z
  .object({
    mode: bulkUploadModeSchema.optional().default("UPSERT"),
    dryRun: z.coerce.boolean().optional().default(false),
    items: z.array(bulkPaisItemInputSchema).min(1).max(500),
  })
  .strict();

export const bulkPaisUploadQuerySchema = z.object({
  mode: bulkUploadModeSchema.optional().default("UPSERT"),
  dryRun: z.coerce.boolean().optional().default(false),
});

export type IdParam = z.infer<typeof idParamSchema>;
export type ListPaisQuery = z.infer<typeof listPaisQuerySchema>;
export type CreatePaisBody = z.infer<typeof createPaisSchema>;
export type UpdatePaisBody = z.infer<typeof updatePaisSchema>;

export type BulkPaisItemInput = z.infer<typeof bulkPaisItemInputSchema>;
export type BulkPaisRequestBody = z.infer<typeof bulkPaisRequestSchema>;
export type BulkPaisUploadQuery = z.infer<typeof bulkPaisUploadQuerySchema>;