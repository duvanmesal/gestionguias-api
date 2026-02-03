import { prisma } from "../../prisma/client";
import { hashPassword, verifyPassword } from "../../libs/password";
import {
  NotFoundError,
  ConflictError,
  BusinessError,
  UnauthorizedError,
} from "../../libs/errors";
import { logger } from "../../libs/logger";
import type {
  CreateUserRequest,
  UpdateUserRequest,
  ChangePasswordRequest,
} from "../auth/auth.schemas";
import type { CompleteProfileRequest, UpdateMeRequest } from "./user.schemas";
import { RolType, ProfileStatus } from "@prisma/client";

export interface PaginationOptions {
  page?: number;
  pageSize?: number;
  search?: string;
  rol?: RolType;
  activo?: boolean;

  // ✅ nuevos filtros
  profileStatus?: ProfileStatus;
  createdFrom?: Date;
  createdTo?: Date;
  updatedFrom?: Date;
  updatedTo?: Date;

  // ✅ ordenamiento
  orderBy?: "createdAt" | "updatedAt" | "email";
  orderDir?: "asc" | "desc";
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export class UserService {
  async getMe(userId: string): Promise<any> {
    const user = await prisma.usuario.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        nombres: true,
        apellidos: true,
        telefono: true,
        rol: true,
        activo: true,
        profileStatus: true,
        profileCompletedAt: true,
        documentType: true,
        createdAt: true,
        updatedAt: true,
        guia: {
          select: {
            id: true,
            telefono: true,
            direccion: true,
          },
        },
        supervisor: {
          select: {
            id: true,
            telefono: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundError("User not found");
    }

    return user;
  }

  async list(options: PaginationOptions = {}): Promise<PaginatedResult<any>> {
    // Normalización defensiva
    const rawPage = Number(options.page ?? 1);
    const rawPageSize = Number(options.pageSize ?? 20);

    const MIN_PAGE_SIZE = 1;
    const MAX_PAGE_SIZE = 100;

    const page =
      Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;

    const pageSizeClampedBase =
      Number.isFinite(rawPageSize) && rawPageSize > 0
        ? Math.floor(rawPageSize)
        : 20;

    const pageSize = Math.min(
      Math.max(pageSizeClampedBase, MIN_PAGE_SIZE),
      MAX_PAGE_SIZE,
    );

    const skip = (page - 1) * pageSize;
    const take = pageSize;

    // Build where clause
    const where: any = {};

    const q = (options.search ?? "").trim();
    if (q !== "") {
      where.OR = [
        { nombres: { contains: q, mode: "insensitive" } },
        { apellidos: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
      ];
    }

    if (options.rol) {
      where.rol = options.rol;
    }

    if (typeof options.activo === "boolean") {
      where.activo = options.activo;
    }

    // ✅ profileStatus
    if (options.profileStatus) {
      where.profileStatus = options.profileStatus;
    }

    // ✅ createdAt range
    if (options.createdFrom || options.createdTo) {
      where.createdAt = {
        ...(options.createdFrom ? { gte: options.createdFrom } : {}),
        ...(options.createdTo ? { lte: options.createdTo } : {}),
      };
    }

    // ✅ updatedAt range
    if (options.updatedFrom || options.updatedTo) {
      where.updatedAt = {
        ...(options.updatedFrom ? { gte: options.updatedFrom } : {}),
        ...(options.updatedTo ? { lte: options.updatedTo } : {}),
      };
    }

    // ✅ ordenamiento configurable
    const orderByField = options.orderBy ?? "createdAt";
    const orderDir = options.orderDir ?? "desc";

    const [total, users] = await Promise.all([
      prisma.usuario.count({ where }),
      prisma.usuario.findMany({
        where,
        select: {
          id: true,
          email: true,
          nombres: true,
          apellidos: true,
          rol: true,
          activo: true,
          profileStatus: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: [{ [orderByField]: orderDir }],
        skip,
        take,
      }),
    ]);

    // ¡Importante!: usar el pageSize EFECTIVO para coherencia con 'take'
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return {
      data: users,
      meta: {
        page,
        pageSize,
        total,
        totalPages,
      },
    };
  }

  async create(data: CreateUserRequest, createdBy: string): Promise<any> {
    // Verificar duplicado por email
    const existingUser = await prisma.usuario.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      throw new ConflictError("User with this email already exists");
    }

    // Hash de contraseña
    const passwordHash = await hashPassword(data.password);

    // Crear usuario
    const user = await prisma.usuario.create({
      data: {
        email: data.email,
        passwordHash,
        nombres: data.nombres,
        apellidos: data.apellidos,
        rol: data.rol,
        activo: true, // tu contrato actual
      },
      select: {
        id: true,
        email: true,
        nombres: true,
        apellidos: true,
        rol: true,
        activo: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    logger.info(
      {
        userId: user.id,
        email: user.email,
        rol: user.rol,
        createdBy,
      },
      "User created by admin",
    );

    return user;
  }

  async updateMe(userId: string, data: UpdateMeRequest): Promise<any> {
    const user = await prisma.usuario.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError("User not found");

    const updateData: any = {};

    if (data.nombres !== undefined) updateData.nombres = data.nombres;
    if (data.apellidos !== undefined) updateData.apellidos = data.apellidos;
    if (data.telefono !== undefined) updateData.telefono = data.telefono;

    if (Object.keys(updateData).length === 0) {
      throw new BusinessError("No fields to update");
    }

    const updated = await prisma.usuario.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        nombres: true,
        apellidos: true,
        telefono: true,
        rol: true,
        activo: true,
        profileStatus: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    logger.info(
      { userId, changes: Object.keys(updateData) },
      "User updated via /me",
    );
    return updated;
  }

  async get(id: string): Promise<any> {
    const user = await prisma.usuario.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        nombres: true,
        apellidos: true,
        rol: true,
        activo: true,
        createdAt: true,
        updatedAt: true,
        guia: {
          select: {
            id: true,
            telefono: true,
            direccion: true,
          },
        },
        supervisor: {
          select: {
            id: true,
            telefono: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundError("User not found");
    }

    return user;
  }

  async update(
    id: string,
    data: UpdateUserRequest,
    updatedBy: string,
    updaterRole: RolType,
  ): Promise<any> {
    const existingUser = await prisma.usuario.findUnique({
      where: { id },
    });

    if (!existingUser) {
      throw new NotFoundError("User not found");
    }

    // Business rules for updates
    const updateData: any = {};

    if (data.nombres !== undefined) {
      updateData.nombres = data.nombres;
    }

    if (data.apellidos !== undefined) {
      updateData.apellidos = data.apellidos;
    }

    // Only SUPER_ADMIN can change roles and active status
    if (updaterRole === RolType.SUPER_ADMIN) {
      if (data.rol !== undefined) {
        updateData.rol = data.rol;
      }

      if (data.activo !== undefined) {
        updateData.activo = data.activo;
      }
    } else {
      // Non-admin users can only update their own basic info
      if (updatedBy !== id) {
        throw new UnauthorizedError("You can only update your own profile");
      }

      if (data.rol !== undefined || data.activo !== undefined) {
        throw new UnauthorizedError("You cannot change role or active status");
      }
    }

    const updatedUser = await prisma.usuario.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        nombres: true,
        apellidos: true,
        rol: true,
        activo: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    logger.info(
      {
        userId: id,
        updatedBy,
        changes: Object.keys(updateData),
      },
      "User updated",
    );

    return updatedUser;
  }

  async changePassword(
    id: string,
    data: ChangePasswordRequest,
    requesterId: string,
  ): Promise<void> {
    // Users can only change their own password
    if (requesterId !== id) {
      throw new UnauthorizedError("You can only change your own password");
    }

    const user = await prisma.usuario.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundError("User not found");
    }

    if (!user.activo) {
      throw new BusinessError("Cannot change password for inactive user");
    }

    // Debe venir currentPassword u oldPassword (según schema nuevo)
    const current = data.currentPassword ?? (data as any).oldPassword;
    if (!current) {
      throw new BusinessError("currentPassword/oldPassword is required");
    }

    // Evita TS error + caso usuario sin password seteado
    if (!user.passwordHash) {
      throw new BusinessError("User has no password set");
    }

    // Verify current password
    const isValidPassword = await verifyPassword(current, user.passwordHash);
    if (!isValidPassword) {
      throw new UnauthorizedError("Current password is incorrect");
    }

    // Hash new password
    const newPasswordHash = await hashPassword(data.newPassword);

    // Update password
    await prisma.usuario.update({
      where: { id },
      data: { passwordHash: newPasswordHash },
    });

    // Revoke all sessions to force re-login
    await prisma.session.updateMany({
      where: {
        userId: id,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
        lastRotatedAt: new Date(),
      },
    });

    logger.info({ userId: id }, "Password changed successfully");
  }

  async deactivate(id: string, deactivatedBy: string): Promise<void> {
    const user = await prisma.usuario.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundError("User not found");
    }

    if (!user.activo) {
      throw new BusinessError("User is already inactive");
    }

    // Prevent self-deactivation
    if (id === deactivatedBy) {
      throw new BusinessError("You cannot deactivate your own account");
    }

    // Deactivate user and revoke all tokens
    await prisma.$transaction([
      prisma.usuario.update({
        where: { id },
        data: { activo: false },
      }),
      prisma.refreshToken.updateMany({
        where: {
          userId: id,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      }),
    ]);

    logger.info(
      {
        userId: id,
        deactivatedBy,
      },
      "User deactivated",
    );
  }

  async activate(id: string, activatedBy: string): Promise<void> {
    const user = await prisma.usuario.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundError("User not found");
    }

    if (user.activo) {
      throw new BusinessError("User is already active");
    }

    await prisma.usuario.update({
      where: { id },
      data: { activo: true },
    });

    logger.info(
      {
        userId: id,
        activatedBy,
      },
      "User activated",
    );
  }

  async completeProfile(
    userId: string,
    data: CompleteProfileRequest,
  ): Promise<any> {
    const user = await prisma.usuario.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundError("User not found");
    }

    if (user.profileStatus === "COMPLETE") {
      throw new BusinessError("Profile is already complete");
    }

    // Check for duplicate document number
    if (data.documentType && data.documentNumber) {
      const existingUserWithDoc = await prisma.usuario.findFirst({
        where: {
          documentType: data.documentType,
          documentNumber: data.documentNumber,
          id: { not: userId },
        },
      });

      if (existingUserWithDoc) {
        throw new ConflictError(
          "A user with this document type and number already exists",
        );
      }
    }

    // Update user profile
    const updatedUser = await prisma.usuario.update({
      where: { id: userId },
      data: {
        nombres: data.nombres,
        apellidos: data.apellidos,
        telefono: data.telefono,
        documentType: data.documentType,
        documentNumber: data.documentNumber,
        profileStatus: "COMPLETE",
        profileCompletedAt: new Date(),
      },
      select: {
        id: true,
        email: true,
        nombres: true,
        apellidos: true,
        rol: true,
        activo: true,
        profileStatus: true,
        profileCompletedAt: true,
        documentType: true,
        telefono: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    logger.info(
      {
        userId,
        documentType: data.documentType,
        documentNumberMasked: data.documentNumber
          .slice(-4)
          .padStart(data.documentNumber.length, "*"),
      },
      "User profile completed",
    );

    // Return without full document number (masked)
    return {
      ...updatedUser,
      documentNumber: data.documentNumber
        .slice(-4)
        .padStart(data.documentNumber.length, "*"),
    };
  }
}

export const userService = new UserService();
