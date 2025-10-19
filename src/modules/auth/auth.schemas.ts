import { z } from "zod";
import { RolType } from "@prisma/client";

export const loginSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password too long"),
  deviceId: z.string().optional(), // Required for mobile, optional for web
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(10, "Invalid refresh token").optional(),
});

export const registerSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password too long")
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
      "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character"
    ),
  nombres: z
    .string()
    .min(1, "First name is required")
    .max(100, "First name too long"),
  apellidos: z
    .string()
    .min(1, "Last name is required")
    .max(100, "Last name too long"),
  rol: z.nativeEnum(RolType),
});

export const createUserSchema = registerSchema;

export const updateUserSchema = z.object({
  nombres: z
    .string()
    .min(1, "First name is required")
    .max(100, "First name too long")
    .optional(),
  apellidos: z
    .string()
    .min(1, "Last name is required")
    .max(100, "Last name too long")
    .optional(),
  rol: z.nativeEnum(RolType).optional(),
  activo: z.boolean().optional(),
});

export const logoutAllSchema = z.object({
  verification: z.discriminatedUnion("method", [
    z.object({
      method: z.literal("password"),
      password: z.string().min(8, "Password too short"),
    }),
    z.object({
      method: z.literal("mfa"),
      code: z.string().min(4).max(10),
    }),
  ]),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password too long")
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
      "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character"
    ),
});

export const listUsersQuerySchema = z.object({
  page: z
    .string()
    .transform((v) => parseInt(v))
    .refine((n) => !isNaN(n) && n > 0, "page must be a positive integer")
    .optional()
    .default("1"),
  pageSize: z
    .string()
    .transform((v) => parseInt(v))
    .refine((n) => !isNaN(n) && n >= 1 && n <= 100, "pageSize must be between 1 and 100")
    .optional()
    .default("20"),
  search: z.string().trim().optional(),
  rol: z.nativeEnum(RolType).optional(),
  activo: z
    .union([z.string(), z.boolean()])
    .transform((v) => (v === "true" || v === true ? true : v === "false" || v === false ? false : undefined))
    .optional(),
})

// Type exports for controllers
export type LoginRequest = z.infer<typeof loginSchema>;
export type RefreshRequest = z.infer<typeof refreshSchema>;
export type RegisterRequest = z.infer<typeof registerSchema>;
export type LogoutAllRequest = z.infer<typeof logoutAllSchema>;
export type CreateUserRequest = z.infer<typeof createUserSchema>;
export type UpdateUserRequest = z.infer<typeof updateUserSchema>;
export type ChangePasswordRequest = z.infer<typeof changePasswordSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;