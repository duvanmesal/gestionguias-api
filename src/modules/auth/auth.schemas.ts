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

// Type exports for controllers
export type LoginRequest = z.infer<typeof loginSchema>;
export type RefreshRequest = z.infer<typeof refreshSchema>;
export type RegisterRequest = z.infer<typeof registerSchema>;
export type LogoutAllRequest = z.infer<typeof logoutAllSchema>;
export type CreateUserRequest = z.infer<typeof createUserSchema>;
export type UpdateUserRequest = z.infer<typeof updateUserSchema>;
export type ChangePasswordRequest = z.infer<typeof changePasswordSchema>;
