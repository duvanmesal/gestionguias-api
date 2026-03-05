import { z } from "zod";
import { StatusType } from "@prisma/client";

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const listBuqueQuerySchema = z.object({
  q: z.string().trim().min(1).max(60).optional(),
  paisId: z.coerce.number().int().positive().optional(),
  status: z.nativeEnum(StatusType).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(10),
});

export const createBuqueSchema = z.object({
  codigo: z.string().trim().min(2).max(20),
  nombre: z.string().trim().min(2),
  paisId: z.coerce.number().int().positive().optional(),
  capacidad: z.coerce.number().int().positive().max(200000).optional(),
  naviera: z.string().trim().min(2).max(80).optional(),
  status: z.nativeEnum(StatusType).optional(),
});

export const updateBuqueSchema = z.object({
  codigo: z.string().trim().min(2).max(20).optional(),
  nombre: z.string().trim().min(2).optional(),
  paisId: z.coerce.number().int().positive().optional(),
  capacidad: z.coerce.number().int().positive().max(200000).optional(),
  naviera: z.string().trim().min(2).max(80).optional(),
  status: z.nativeEnum(StatusType).optional(),
});

export const bulkUploadModeSchema = z.enum(["UPSERT", "CREATE_ONLY"]);
export type BulkUploadMode = z.infer<typeof bulkUploadModeSchema>;

export const bulkBuqueItemInputSchema = z
  .object({
    codigo: z.string().trim().max(20).optional(),
    nombre: z.string().trim().optional(),
    paisId: z.coerce.number().int().positive().optional(),
    capacidad: z.coerce.number().int().positive().max(200000).optional(),
    naviera: z.string().trim().max(80).optional(),
    status: z.nativeEnum(StatusType).optional(),
  })
  .strict();

export const bulkBuqueRequestSchema = z
  .object({
    mode: bulkUploadModeSchema.optional().default("UPSERT"),
    dryRun: z.coerce.boolean().optional().default(false),
    force: z.coerce.boolean().optional().default(false),
    items: z.array(bulkBuqueItemInputSchema).min(1).max(500),
  })
  .strict();

export const bulkBuqueUploadQuerySchema = z.object({
  mode: bulkUploadModeSchema.optional().default("UPSERT"),
  dryRun: z.coerce.boolean().optional().default(false),
  force: z.coerce.boolean().optional().default(false),
});

export type IdParam = z.infer<typeof idParamSchema>;
export type ListBuqueQuery = z.infer<typeof listBuqueQuerySchema>;
export type CreateBuqueBody = z.infer<typeof createBuqueSchema>;
export type UpdateBuqueBody = z.infer<typeof updateBuqueSchema>;

export type BulkBuqueItemInput = z.infer<typeof bulkBuqueItemInputSchema>;
export type BulkBuqueRequestBody = z.infer<typeof bulkBuqueRequestSchema>;
export type BulkBuqueUploadQuery = z.infer<typeof bulkBuqueUploadQuerySchema>;