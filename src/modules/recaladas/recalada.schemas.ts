import { z } from "zod";
import { RecaladaSource, StatusType } from "@prisma/client";

export const createRecaladaSchema = z
  .object({
    buqueId: z.coerce.number().int().positive(),
    paisOrigenId: z.coerce.number().int().positive(),

    // ISO string (DateTime)
    fechaLlegada: z.coerce.date(),
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

    // Por ahora NO lo exponemos como input (se maneja por negocio),
    // pero si en el futuro lo quieres permitir, ya está listo:
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
  );
