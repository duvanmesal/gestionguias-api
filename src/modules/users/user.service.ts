import { prisma } from "../../prisma/client"
import { hashPassword, verifyPassword } from "../../libs/password"
import { NotFoundError, ConflictError, BusinessError, UnauthorizedError } from "../../libs/errors"
import { logger } from "../../libs/logger"
import type { CreateUserRequest, UpdateUserRequest, ChangePasswordRequest } from "../auth/auth.schemas"
import { RolType } from "@prisma/client"

export interface PaginationOptions {
  page?: number
  pageSize?: number
  search?: string
  rol?: RolType
  activo?: boolean
}

export interface PaginatedResult<T> {
  data: T[]
  meta: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

export class UserService {
  async list(options: PaginationOptions = {}): Promise<PaginatedResult<any>> {
    const { page = 1, pageSize = 20, search, rol, activo } = options

    const skip = (page - 1) * pageSize
    const take = Math.min(pageSize, 100) // Max 100 items per page

    // Build where clause
    const where: any = {}

    if (search) {
      where.OR = [
        { nombres: { contains: search, mode: "insensitive" } },
        { apellidos: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ]
    }

    if (rol) {
      where.rol = rol
    }

    if (typeof activo === "boolean") {
      where.activo = activo
    }

    // Get total count and data
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
          createdAt: true,
          updatedAt: true,
        },
        orderBy: [{ createdAt: "desc" }],
        skip,
        take,
      }),
    ])

    const totalPages = Math.ceil(total / pageSize)

    return {
      data: users,
      meta: {
        page,
        pageSize,
        total,
        totalPages,
      },
    }
  }

  async create(data: CreateUserRequest, createdBy: string): Promise<any> {
    // Check if user already exists
    const existingUser = await prisma.usuario.findUnique({
      where: { email: data.email },
    })

    if (existingUser) {
      throw new ConflictError("User with this email already exists")
    }

    // Hash password
    const passwordHash = await hashPassword(data.password)

    // Create user
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
    })

    logger.info(
      {
        userId: user.id,
        email: user.email,
        rol: user.rol,
        createdBy,
      },
      "User created by admin",
    )

    return user
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
    })

    if (!user) {
      throw new NotFoundError("User not found")
    }

    return user
  }

  async update(id: string, data: UpdateUserRequest, updatedBy: string, updaterRole: RolType): Promise<any> {
    const existingUser = await prisma.usuario.findUnique({
      where: { id },
    })

    if (!existingUser) {
      throw new NotFoundError("User not found")
    }

    // Business rules for updates
    const updateData: any = {}

    if (data.nombres !== undefined) {
      updateData.nombres = data.nombres
    }

    if (data.apellidos !== undefined) {
      updateData.apellidos = data.apellidos
    }

    // Only SUPER_ADMIN can change roles and active status
    if (updaterRole === RolType.SUPER_ADMIN) {
      if (data.rol !== undefined) {
        updateData.rol = data.rol
      }

      if (data.activo !== undefined) {
        updateData.activo = data.activo
      }
    } else {
      // Non-admin users can only update their own basic info
      if (updatedBy !== id) {
        throw new UnauthorizedError("You can only update your own profile")
      }

      if (data.rol !== undefined || data.activo !== undefined) {
        throw new UnauthorizedError("You cannot change role or active status")
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
    })

    logger.info(
      {
        userId: id,
        updatedBy,
        changes: Object.keys(updateData),
      },
      "User updated",
    )

    return updatedUser
  }

  async changePassword(id: string, data: ChangePasswordRequest, requesterId: string): Promise<void> {
    // Users can only change their own password
    if (requesterId !== id) {
      throw new UnauthorizedError("You can only change your own password")
    }

    const user = await prisma.usuario.findUnique({
      where: { id },
    })

    if (!user) {
      throw new NotFoundError("User not found")
    }

    if (!user.activo) {
      throw new BusinessError("Cannot change password for inactive user")
    }

    // Verify current password
    const isValidPassword = await verifyPassword(data.currentPassword, user.passwordHash)
    if (!isValidPassword) {
      throw new UnauthorizedError("Current password is incorrect")
    }

    // Hash new password
    const newPasswordHash = await hashPassword(data.newPassword)

    // Update password
    await prisma.usuario.update({
      where: { id },
      data: { passwordHash: newPasswordHash },
    })

    // Revoke all refresh tokens to force re-login
    await prisma.refreshToken.updateMany({
      where: {
        userId: id,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    })

    logger.info({ userId: id }, "Password changed successfully")
  }

  async deactivate(id: string, deactivatedBy: string): Promise<void> {
    const user = await prisma.usuario.findUnique({
      where: { id },
    })

    if (!user) {
      throw new NotFoundError("User not found")
    }

    if (!user.activo) {
      throw new BusinessError("User is already inactive")
    }

    // Prevent self-deactivation
    if (id === deactivatedBy) {
      throw new BusinessError("You cannot deactivate your own account")
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
    ])

    logger.info(
      {
        userId: id,
        deactivatedBy,
      },
      "User deactivated",
    )
  }

  async activate(id: string, activatedBy: string): Promise<void> {
    const user = await prisma.usuario.findUnique({
      where: { id },
    })

    if (!user) {
      throw new NotFoundError("User not found")
    }

    if (user.activo) {
      throw new BusinessError("User is already active")
    }

    await prisma.usuario.update({
      where: { id },
      data: { activo: true },
    })

    logger.info(
      {
        userId: id,
        activatedBy,
      },
      "User activated",
    )
  }
}

export const userService = new UserService()
