import { z } from "zod";
import { DocumentType } from "@prisma/client";

export const completeProfileSchema = z.object({
  nombres: z
    .string()
    .min(1, "First name is required")
    .max(100, "First name too long")
    .trim(),
  apellidos: z
    .string()
    .min(1, "Last name is required")
    .max(100, "Last name too long")
    .trim(),
  telefono: z
    .string()
    .min(7, "Phone number must be at least 7 characters")
    .max(20, "Phone number too long")
    .regex(/^[0-9+\-\s()]+$/, "Invalid phone number format")
    .trim(),
  documentType: z.nativeEnum(DocumentType, {
    errorMap: () => ({ message: "Invalid document type" }),
  }),
  documentNumber: z
    .string()
    .min(6, "Document number must be at least 6 characters")
    .max(20, "Document number too long")
    .regex(
      /^[A-Za-z0-9]+$/,
      "Document number can only contain letters and numbers",
    )
    .trim()
    .transform((val) => val.replace(/[\s\-.]/g, "").toUpperCase()),
  currentPassword: z
    .string()
    .min(1, "Current password is required")
    .optional(),
  oldPassword: z.string().min(1, "Old password is required").optional(),
  newPassword: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password too long")
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
      "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character",
    ),
}).superRefine((data, ctx) => {
  const hasCurrent = !!data.currentPassword;
  const hasOld = !!data.oldPassword;

  if (!hasCurrent && !hasOld) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Either currentPassword or oldPassword is required",
      path: ["currentPassword"],
    });
  }

  if (hasCurrent && hasOld) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Provide only one: currentPassword OR oldPassword",
      path: ["currentPassword"],
    });
  }

  const current = data.currentPassword ?? data.oldPassword;
  if (current && current === data.newPassword) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "New password must be different from current password",
      path: ["newPassword"],
    });
  }
});

export const updateMeSchema = z
  .object({
    nombres: z.string().min(1).max(100).trim().optional(),
    apellidos: z.string().min(1).max(100).trim().optional(),
    telefono: z
      .string()
      .min(7, "Phone number must be at least 7 characters")
      .max(20, "Phone number too long")
      .regex(/^[0-9+\-\s()]+$/, "Invalid phone number format")
      .trim()
      .optional(),
  })
  .refine(
    (d) =>
      d.nombres !== undefined ||
      d.apellidos !== undefined ||
      d.telefono !== undefined,
    { message: "At least one field is required" },
  );

/**
 * GET /users/guides
 * Query opcional:
 * - activo=true|false (default true)
 * - search=texto
 */
export const listGuidesQuerySchema = z.object({
  activo: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .transform((v) => (v === true || v === "true" ? true : false))
    .default(true),
  disponible: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .transform((v) => (v === true || v === "true" ? true : false))
    .optional(),
  penalizado: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .transform((v) => (v === true || v === "true" ? true : false))
    .optional(),
  search: z
    .string()
    .trim()
    .min(1, "search must not be empty")
    .max(100, "search too long")
    .optional(),
});

export const updateDisponibilidadGlobalSchema = z.object({
  disponible: z.boolean(),
});

export type UpdateMeRequest = z.infer<typeof updateMeSchema>;
export type CompleteProfileRequest = z.infer<typeof completeProfileSchema>;

export type ListGuidesQuery = z.infer<typeof listGuidesQuerySchema>;
export type UpdateDisponibilidadGlobalRequest = z.infer<typeof updateDisponibilidadGlobalSchema>;
