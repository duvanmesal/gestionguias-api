import { z } from "zod";
import {
  RecaladaSource,
  StatusType,
  RecaladaOperativeStatus,
} from "@prisma/client";

export const createRecaladaSchema = z
  .object({
    buqueId: z.coerce.number().int().positive(),
    paisOrigenId: z.coerce.number().int().positive(),
    puertoId: z.coerce.number().int().positive().optional(),
    muelleId: z.coerce.number().int().positive().optional(),
    slotId: z.coerce.number().int().positive().optional(),
    slotNumero: z.coerce.number().int().min(1).max(4).optional(),

    // ISO string (DateTime)
    fechaLlegada: z.coerce.date(),
    fechaSalida: z.coerce.date().optional(),

    terminal: z.string().trim().min(2).max(80).optional(),
    muelle: z.string().trim().min(1).max(80).optional(),

    // Viejo: total_turistas >= 1 (si mandan el campo)
    pasajerosEstimados: z.coerce.number().int().min(1).max(300000).optional(),

    tripulacionEstimada: z.coerce
      .number()
      .int()
      .nonnegative()
      .max(300000)
      .optional(),

    observaciones: z.string().trim().max(2000).optional(),
    fuente: z.nativeEnum(RecaladaSource).optional(),

    // Manejado por negocio
    status: z.nativeEnum(StatusType).optional(),
  })
  .refine(
    (data) =>
      !data.fechaSalida ||
      data.fechaSalida.getTime() >= data.fechaLlegada.getTime(),
    {
      message: "fechaSalida debe ser mayor o igual a fechaLlegada",
      path: ["fechaSalida"],
    },
  )
  .refine(
    (data) => {
      // PR-01: Si MANUAL (o default) y mandan fechaSalida -> fechaSalida >= now
      // Si IMPORT -> permitir pasado
      const source = data.fuente ?? RecaladaSource.MANUAL;
      if (source === RecaladaSource.IMPORT) return true;
      if (!data.fechaSalida) return true;
      return data.fechaSalida.getTime() >= Date.now();
    },
    {
      message:
        "fechaSalida debe ser mayor o igual a ahora para recalada MANUAL (operativa)",
      path: ["fechaSalida"],
    },
  );

// Acepta "true"/"false"/"1"/"0" desde query string y los coacciona a boolean.
const booleanFromQuery = z
  .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
  .transform((v) => v === true || v === "true" || v === "1")
  .optional();

export const listRecaladasQuerySchema = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),

    operationalStatus: z.nativeEnum(RecaladaOperativeStatus).optional(),

    buqueId: z.coerce.number().int().positive().optional(),
    paisOrigenId: z.coerce.number().int().positive().optional(),
    puertoId: z.coerce.number().int().positive().optional(),
    muelleId: z.coerce.number().int().positive().optional(),

    q: z.string().trim().min(1).max(200).optional(),

    // Filtro operativo: recaladas ARRIVED cuyo zarpe programado ya venció.
    overdueDeparture: booleanFromQuery,

    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
  })
  .refine((data) => !data.from || !data.to || data.to >= data.from, {
    message: "to debe ser mayor o igual a from",
    path: ["to"],
  });

export const getRecaladaByIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const updateRecaladaParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const updateRecaladaBodySchema = z
  .object({
    buqueId: z.coerce.number().int().positive().optional(),
    paisOrigenId: z.coerce.number().int().positive().optional(),
    puertoId: z.coerce.number().int().positive().nullable().optional(),
    muelleId: z.coerce.number().int().positive().nullable().optional(),
    slotId: z.coerce.number().int().positive().nullable().optional(),
    slotNumero: z.coerce.number().int().min(1).max(4).optional(),

    fechaLlegada: z.coerce.date().optional(),
    fechaSalida: z.coerce.date().optional(),

    terminal: z.string().trim().min(2).max(80).optional(),
    muelle: z.string().trim().min(1).max(80).optional(),

    pasajerosEstimados: z.coerce
      .number()
      .int()
      .nonnegative()
      .max(300000)
      .optional(),
    tripulacionEstimada: z.coerce
      .number()
      .int()
      .nonnegative()
      .max(300000)
      .optional(),

    observaciones: z.string().trim().max(2000).optional(),
    fuente: z.nativeEnum(RecaladaSource).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "Debe enviar al menos un campo para actualizar",
  })
  .refine(
    (data) =>
      !data.fechaLlegada ||
      !data.fechaSalida ||
      data.fechaSalida.getTime() >= data.fechaLlegada.getTime(),
    {
      message: "fechaSalida debe ser mayor o igual a fechaLlegada",
      path: ["fechaSalida"],
    },
  );

export const deleteRecaladaParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const arriveRecaladaParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const arriveRecaladaBodySchema = z
  .object({
    arrivedAt: z.coerce.date().optional(),
  })
  .strict();

export const departRecaladaParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const departRecaladaBodySchema = z
  .object({
    departedAt: z.coerce.date().optional(),
  })
  .strict();

export const cancelRecaladaParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const cancelRecaladaBodySchema = z
  .object({
    reason: z.string().trim().min(3).max(500).optional(),
  })
  .strict();

export type CreateRecaladaBody = z.infer<typeof createRecaladaSchema>;

export type ListRecaladasQuery = z.infer<typeof listRecaladasQuerySchema>;

export type GetRecaladaByIdParams = z.infer<typeof getRecaladaByIdParamsSchema>;

export type UpdateRecaladaParams = z.infer<typeof updateRecaladaParamsSchema>;
export type UpdateRecaladaBody = z.infer<typeof updateRecaladaBodySchema>;

export type DeleteRecaladaParams = z.infer<typeof deleteRecaladaParamsSchema>;

export type ArriveRecaladaParams = z.infer<typeof arriveRecaladaParamsSchema>;
export type ArriveRecaladaBody = z.infer<typeof arriveRecaladaBodySchema>;

export type DepartRecaladaParams = z.infer<typeof departRecaladaParamsSchema>;
export type DepartRecaladaBody = z.infer<typeof departRecaladaBodySchema>;

export type CancelRecaladaParams = z.infer<typeof cancelRecaladaParamsSchema>;
export type CancelRecaladaBody = z.infer<typeof cancelRecaladaBodySchema>;

// ─── Bulk ────────────────────────────────────────────────────────────────────

export const bulkRecaladaItemSchema = z.object({
  codigoRecalada: z.string().trim().optional(),
  buqueCodigo: z.string().trim().optional(),
  buqueId: z.coerce.number().int().positive().optional(),
  paisOrigenCodigo: z.string().trim().optional(),
  paisOrigenId: z.coerce.number().int().positive().optional(),
  supervisorEmail: z.string().email().optional(),
  supervisorId: z.string().trim().optional(),
  slotNumero: z.coerce.number().int().min(1).max(4).optional(),
  slotId: z.coerce.number().int().positive().optional(),
  fechaLlegada: z.coerce.date(),
  fechaSalida: z.coerce.date().optional(),
  pasajerosEstimados: z.coerce.number().int().min(1).max(300000).optional(),
  tripulacionEstimada: z.coerce.number().int().nonnegative().max(300000).optional(),
  observaciones: z.string().trim().max(2000).optional(),
})

export const bulkRecaladaRequestSchema = z.object({
  mode: z.enum(["UPSERT", "CREATE_ONLY"]).default("UPSERT"),
  dryRun: z.coerce.boolean().default(false),
  items: z.array(bulkRecaladaItemSchema).min(1).max(500),
})

export const bulkRecaladaUploadQuerySchema = z.object({
  mode: z.enum(["UPSERT", "CREATE_ONLY"]).default("UPSERT"),
  dryRun: z.coerce.boolean().default(false),
})

export type BulkRecaladaItem = z.infer<typeof bulkRecaladaItemSchema>
export type BulkRecaladaRequest = z.infer<typeof bulkRecaladaRequestSchema>
export type BulkRecaladaUploadQuery = z.infer<typeof bulkRecaladaUploadQuerySchema>
