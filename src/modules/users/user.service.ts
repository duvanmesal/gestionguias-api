import type { Request } from "express";
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
import type {
  CompleteProfileRequest,
  UpdateMeRequest,
  ListGuidesQuery,
} from "./user.schemas";

import { RolType, ProfileStatus } from "@prisma/client";

// ✅ NEW: logs facade (DRY)
import { logsService } from "../../libs/logs/logs.service";

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
        emailVerifiedAt: true,
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

          // ✅ IDs operativos (para UI: asignar turnos, paneles, etc.)
          guia: { select: { id: true } },
          supervisor: { select: { id: true } },
        },
        orderBy: [{ [orderByField]: orderDir }],
        skip,
        take,
      }),
    ]);

    const normalized = users.map((u: any) => ({
      id: u.id,
      email: u.email,
      nombres: u.nombres,
      apellidos: u.apellidos,
      rol: u.rol,
      activo: u.activo,
      profileStatus: u.profileStatus,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,

      guiaId: u.guia?.id ?? null,
      supervisorId: u.supervisor?.id ?? null,
    }));

    // ¡Importante!: usar el pageSize EFECTIVO para coherencia con 'take'
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return {
      data: normalized,
      meta: {
        page,
        pageSize,
        total,
        totalPages,
      },
    };
  }

  async listGuidesLookup(query: ListGuidesQuery) {
    const activo =
      typeof (query as any).activo === "boolean" ? (query as any).activo : true;

    const q = (query.search ?? "").trim();

    const whereUser: any = {
      rol: RolType.GUIA,
      ...(typeof activo === "boolean" ? { activo } : {}),
      ...(q
        ? {
            OR: [
              { nombres: { contains: q, mode: "insensitive" } },
              { apellidos: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const rows = await prisma.guia.findMany({
      where: {
        usuario: whereUser,
      },
      select: {
        id: true,
        usuario: {
          select: {
            email: true,
            nombres: true,
            apellidos: true,
            activo: true,
          },
        },
      },
      orderBy: [
        { usuario: { nombres: "asc" } },
        { usuario: { apellidos: "asc" } },
        { id: "asc" },
      ],
      take: 500,
    });

    return rows.map((g) => ({
      guiaId: g.id,
      nombres: g.usuario.nombres,
      apellidos: g.usuario.apellidos,
      email: g.usuario.email,
      activo: g.usuario.activo,
    }));
  }

  // ✅ CHANGED: recibe req
  async create(
    req: Request,
    data: CreateUserRequest,
    createdBy: string,
  ): Promise<any> {
    const existingUser = await prisma.usuario.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      logsService.audit(req, {
        event: "user.created",
        level: "warn",
        target: { entity: "User", email: data.email },
        meta: { reason: "duplicate_email", createdBy },
        message: "User create failed",
      });
      throw new ConflictError("User with this email already exists");
    }

    const passwordHash = await hashPassword(data.password);

    const user = await prisma.usuario.create({
      data: {
        email: data.email,
        passwordHash,
        nombres: data.nombres,
        apellidos: data.apellidos,
        rol: data.rol,
        activo: true,
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
      { userId: user.id, email: user.email, rol: user.rol, createdBy },
      "User created by admin",
    );

    // ✅ audit
    logsService.audit(req, {
      event: "user.created",
      target: { entity: "User", id: String(user.id), email: user.email },
      meta: { createdBy, rol: user.rol },
      message: "User created",
    });

    return user;
  }

  // ✅ CHANGED: recibe req
  async updateMe(
    req: Request,
    userId: string,
    data: UpdateMeRequest,
  ): Promise<any> {
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

    // ✅ audit
    logsService.audit(req, {
      event: "user.updated",
      target: { entity: "User", id: String(updated.id), email: updated.email },
      meta: { by: "self", fields: Object.keys(updateData) },
      message: "User updated (me)",
    });

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

  // ✅ CHANGED: recibe req
  async update(
    req: Request,
    id: string,
    data: UpdateUserRequest,
    updatedBy: string,
    updaterRole: RolType,
  ): Promise<any> {
    const existingUser = await prisma.usuario.findUnique({ where: { id } });
    if (!existingUser) throw new NotFoundError("User not found");

    const updateData: any = {};

    if (data.nombres !== undefined) updateData.nombres = data.nombres;
    if (data.apellidos !== undefined) updateData.apellidos = data.apellidos;

    if (updaterRole === RolType.SUPER_ADMIN) {
      if (data.rol !== undefined) updateData.rol = data.rol;
      if (data.activo !== undefined) updateData.activo = data.activo;
    } else {
      if (updatedBy !== id)
        throw new UnauthorizedError("You can only update your own profile");
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
      { userId: id, updatedBy, changes: Object.keys(updateData) },
      "User updated",
    );

    // ✅ audit user.updated
    logsService.audit(req, {
      event: "user.updated",
      target: {
        entity: "User",
        id: String(updatedUser.id),
        email: updatedUser.email,
      },
      meta: { updatedBy, fields: Object.keys(updateData) },
      message: "User updated",
    });

    // ✅ audit role change (si aplica)
    if (updateData.rol !== undefined && updateData.rol !== existingUser.rol) {
      logsService.audit(req, {
        event: "user.role.changed",
        target: {
          entity: "User",
          id: String(updatedUser.id),
          email: updatedUser.email,
        },
        meta: { updatedBy, from: existingUser.rol, to: updatedUser.rol },
        message: "User role changed",
      });
    }

    return updatedUser;
  }

  // ✅ CHANGED: recibe req
  async changePassword(
    req: Request,
    id: string,
    data: ChangePasswordRequest,
    requesterId: string,
  ): Promise<void> {
    if (requesterId !== id) {
      throw new UnauthorizedError("You can only change your own password");
    }

    const user = await prisma.usuario.findUnique({ where: { id } });
    if (!user) throw new NotFoundError("User not found");
    if (!user.activo)
      throw new BusinessError("Cannot change password for inactive user");

    const current = data.currentPassword ?? (data as any).oldPassword;
    if (!current)
      throw new BusinessError("currentPassword/oldPassword is required");

    if (!user.passwordHash) throw new BusinessError("User has no password set");

    const isValidPassword = await verifyPassword(current, user.passwordHash);
    if (!isValidPassword) {
      logsService.audit(req, {
        event: "user.updated",
        level: "warn",
        target: { entity: "User", id: String(id), email: user.email },
        meta: { reason: "invalid_current_password", action: "changePassword" },
        message: "Password change failed",
      });
      throw new UnauthorizedError("Current password is incorrect");
    }

    const newPasswordHash = await hashPassword(data.newPassword);

    await prisma.usuario.update({
      where: { id },
      data: { passwordHash: newPasswordHash },
    });

    await prisma.session.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date(), lastRotatedAt: new Date() },
    });

    logger.info({ userId: id }, "Password changed successfully");

    // ✅ audit (sin secretos)
    logsService.audit(req, {
      event: "user.updated",
      target: { entity: "User", id: String(id), email: user.email },
      meta: { action: "changePassword" },
      message: "Password changed",
    });
  }

  // ✅ CHANGED: recibe req
  async deactivate(
    req: Request,
    id: string,
    deactivatedBy: string,
  ): Promise<void> {
    const user = await prisma.usuario.findUnique({ where: { id } });
    if (!user) throw new NotFoundError("User not found");
    if (!user.activo) throw new BusinessError("User is already inactive");
    if (id === deactivatedBy)
      throw new BusinessError("You cannot deactivate your own account");

    await prisma.$transaction([
      prisma.usuario.update({ where: { id }, data: { activo: false } }),
      prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    logger.info({ userId: id, deactivatedBy }, "User deactivated");

    logsService.audit(req, {
      event: "user.updated",
      level: "warn",
      target: { entity: "User", id: String(id), email: user.email },
      meta: { deactivatedBy, fields: ["activo"], from: true, to: false },
      message: "User deactivated",
    });
  }

  // ✅ CHANGED: recibe req
  async activate(req: Request, id: string, activatedBy: string): Promise<void> {
    const user = await prisma.usuario.findUnique({ where: { id } });
    if (!user) throw new NotFoundError("User not found");
    if (user.activo) throw new BusinessError("User is already active");

    await prisma.usuario.update({ where: { id }, data: { activo: true } });

    logger.info({ userId: id, activatedBy }, "User activated");

    logsService.audit(req, {
      event: "user.updated",
      target: { entity: "User", id: String(id), email: user.email },
      meta: { activatedBy, fields: ["activo"], from: false, to: true },
      message: "User activated",
    });
  }

  // ✅ CHANGED: recibe req
  async completeProfile(
    req: Request,
    userId: string,
    data: CompleteProfileRequest,
  ): Promise<any> {
    const user = await prisma.usuario.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError("User not found");
    if (user.profileStatus === "COMPLETE")
      throw new BusinessError("Profile is already complete");

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

    if (updatedUser.rol === "GUIA") {
      await prisma.guia.upsert({
        where: { usuarioId: updatedUser.id },
        create: { usuarioId: updatedUser.id },
        update: {},
      });
    }

    if (updatedUser.rol === "SUPERVISOR") {
      await prisma.supervisor.upsert({
        where: { usuarioId: updatedUser.id },
        create: { usuarioId: updatedUser.id },
        update: {},
      });
    }

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

    // ✅ audit profile completed
    logsService.audit(req, {
      event: "user.profile.completed",
      target: {
        entity: "User",
        id: String(updatedUser.id),
        email: updatedUser.email,
      },
      meta: {
        documentType: data.documentType ?? null,
        hasPhone: !!data.telefono,
      },
      message: "Profile completed",
    });

    return {
      ...updatedUser,
      documentNumber: data.documentNumber
        .slice(-4)
        .padStart(data.documentNumber.length, "*"),
    };
  }
}

export const userService = new UserService();
