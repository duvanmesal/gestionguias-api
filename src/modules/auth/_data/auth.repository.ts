import { prisma } from "../../../prisma/client";
import type { Platform, RolType } from "@prisma/client";
import {
  sessionListSelect,
  usuarioForLoginSelect,
  usuarioPublicSelect,
} from "./auth.select";

export type SessionWithUser = {
  id: string;
  userId: string;
  platform: Platform;
  deviceId: string | null;
  userAgent: string | null;
  ip: string | null;
  refreshTokenHash: string | null;
  refreshExpiresAt: Date | null;
  lastRotatedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  user: {
    id: string;
    email: string;
    rol: RolType;
    activo: boolean;
  };
};

export type PasswordResetCandidate = {
  tokenId: string;
  userId: string;
  userEmail: string;
  userActive: boolean;
  currentPasswordHash: string;
};

export type EmailVerifyCandidate = {
  tokenId: string;
  userId: string;
  userEmail: string;
  userActive: boolean;
  userAlreadyVerified: boolean;
  expiresAt: Date;
  usedAt: Date | null;
};

export class AuthRepository {
  // -------- users --------
  findUserByEmailForLogin(email: string) {
    return prisma.usuario.findUnique({
      where: { email },
      select: usuarioForLoginSelect,
    });
  }

  findUserByIdPublic(userId: string) {
    return prisma.usuario.findUnique({
      where: { id: userId },
      select: usuarioPublicSelect,
    });
  }

  findUserByIdForPasswordCheck(userId: string) {
    return prisma.usuario.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        activo: true,
        passwordHash: true,
      },
    });
  }

  findUserByEmailMinimal(email: string) {
    return prisma.usuario.findUnique({
      where: { email },
      select: { id: true, email: true, activo: true },
    });
  }

  findUserByEmailForEmailVerification(email: string) {
    return prisma.usuario.findUnique({
      where: { email },
      select: { id: true, email: true, activo: true, emailVerifiedAt: true },
    });
  }

  createUser(data: {
    email: string;
    passwordHash: string;
    nombres: string;
    apellidos: string;
    rol: RolType;
  }) {
    return prisma.usuario.create({
      data: {
        email: data.email,
        passwordHash: data.passwordHash,
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
      },
    });
  }

  updateUserPasswordHash(userId: string, newPasswordHash: string) {
    return prisma.usuario.update({
      where: { id: userId },
      data: { passwordHash: newPasswordHash },
    });
  }

  // -------- sessions --------
  createSession(data: {
    userId: string;
    platform: Platform;
    deviceId: string | null;
    userAgent?: string;
    ip?: string;
    refreshTokenHash: string;
    refreshExpiresAt: Date;
  }) {
    return prisma.session.create({
      data: {
        userId: data.userId,
        platform: data.platform,
        deviceId: data.deviceId,
        userAgent: data.userAgent,
        ip: data.ip,
        refreshTokenHash: data.refreshTokenHash,
        refreshExpiresAt: data.refreshExpiresAt,
      },
      select: {
        id: true,
        platform: true,
        createdAt: true,
      },
    });
  }

  findSessionByRefreshTokenHash(refreshTokenHash: string) {
    return prisma.session.findUnique({
      where: { refreshTokenHash },
      include: {
        user: {
          select: { id: true, email: true, rol: true, activo: true },
        },
      },
    }) as unknown as Promise<SessionWithUser | null>;
  }

  rotateRefreshTokenAtomic(args: {
    sessionId: string;
    oldHash: string;
    newHash: string;
    newExpiresAt: Date;
    ip?: string;
    userAgent?: string;
    now: Date;
  }) {
    return prisma.session.updateMany({
      where: { id: args.sessionId, refreshTokenHash: args.oldHash },
      data: {
        refreshTokenHash: args.newHash,
        refreshExpiresAt: args.newExpiresAt,
        lastRotatedAt: args.now,
        ip: args.ip,
        userAgent: args.userAgent,
      },
    });
  }

  findSessionById(sessionId: string) {
    return prisma.session.findUnique({ where: { id: sessionId } });
  }

  revokeSessionById(sessionId: string, now: Date) {
    return prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt: now },
    });
  }

  revokeAllUserSessions(userId: string, now: Date) {
    return prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    });
  }

  revokeAllUserSessionsWithRotationStamp(userId: string, now: Date) {
    return prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now, lastRotatedAt: now },
    });
  }

  listActiveSessions(userId: string) {
    return prisma.session.findMany({
      where: {
        userId,
        revokedAt: null,
        refreshExpiresAt: { gt: new Date() },
      },
      select: sessionListSelect,
      orderBy: { createdAt: "desc" },
    });
  }

  findUserSession(sessionId: string, userId: string) {
    return prisma.session.findFirst({ where: { id: sessionId, userId } });
  }

  // -------- password reset tokens --------
  invalidateActivePasswordResetTokens(userId: string, now: Date) {
    return prisma.passwordResetToken.updateMany({
      where: { userId, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
  }

  createPasswordResetToken(data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }) {
    return prisma.passwordResetToken.create({
      data: {
        userId: data.userId,
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
      },
    });
  }

  async getPasswordResetCandidate(
    tokenHash: string,
    now: Date,
  ): Promise<PasswordResetCandidate | null> {
    const prt = await prisma.passwordResetToken.findFirst({
      where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
      select: { id: true, userId: true },
    });

    if (!prt) return null;

    const user = await prisma.usuario.findUnique({
      where: { id: prt.userId },
      select: { id: true, activo: true, passwordHash: true, email: true },
    });

    if (!user) return null;

    return {
      tokenId: prt.id,
      userId: user.id,
      userEmail: user.email,
      userActive: user.activo,
      currentPasswordHash: user.passwordHash,
    };
  }

  async applyPasswordReset(args: {
    tokenId: string;
    tokenHash: string;
    userId: string;
    newPasswordHash: string;
    now: Date;
  }): Promise<boolean> {
    // Atomic apply: only succeeds if token is still unused and not expired
    return prisma.$transaction(async (tx) => {
      const used = await tx.passwordResetToken.updateMany({
        where: {
          id: args.tokenId,
          tokenHash: args.tokenHash,
          usedAt: null,
          expiresAt: { gt: args.now },
        },
        data: { usedAt: args.now },
      });

      if (used.count === 0) return false;

      await tx.usuario.update({
        where: { id: args.userId },
        data: { passwordHash: args.newPasswordHash },
      });

      await tx.passwordResetToken.updateMany({
        where: {
          userId: args.userId,
          usedAt: null,
          expiresAt: { gt: args.now },
        },
        data: { usedAt: args.now },
      });

      return true;
    });
  }

  // -------- email verification tokens --------
  invalidateActiveEmailVerificationTokens(userId: string, now: Date) {
    return prisma.emailVerificationToken.updateMany({
      where: { userId, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
  }

  createEmailVerificationToken(data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    codeHash?: string;
  }) {
    return prisma.emailVerificationToken.create({
      data: {
        userId: data.userId,
        tokenHash: data.tokenHash,
        codeHash: data.codeHash,
        expiresAt: data.expiresAt,
      },
    });
  }

  async getEmailVerifyCandidate(
    tokenHash: string,
    now: Date,
  ): Promise<EmailVerifyCandidate | null> {
    const record = await prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        usedAt: true,
        user: {
          select: {
            id: true,
            activo: true,
            emailVerifiedAt: true,
            email: true,
          },
        },
      },
    });

    if (!record || !record.user) return null;

    return {
      tokenId: record.id,
      userId: record.userId,
      userEmail: record.user.email,
      userActive: record.user.activo,
      userAlreadyVerified: !!record.user.emailVerifiedAt,
      expiresAt: record.expiresAt,
      usedAt: record.usedAt,
    };
  }

  async getEmailVerifyCandidateByEmailAndCode(
    email: string,
    codeHash: string,
    now: Date,
  ): Promise<EmailVerifyCandidate | null> {
    const record = await prisma.emailVerificationToken.findFirst({
      where: {
        codeHash,
        user: { email },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        usedAt: true,
        user: {
          select: {
            id: true,
            activo: true,
            emailVerifiedAt: true,
            email: true,
          },
        },
      },
    });

    if (!record || !record.user) return null;

    // NOTE: dejamos las validaciones de exp/used en el usecase (consistencia con token)
    return {
      tokenId: record.id,
      userId: record.userId,
      userEmail: record.user.email,
      userActive: record.user.activo,
      userAlreadyVerified: !!record.user.emailVerifiedAt,
      expiresAt: record.expiresAt,
      usedAt: record.usedAt,
    };
  }

  async applyEmailVerification(args: {
    tokenHash: string;
    tokenId: string;
    userId: string;
    now: Date;
  }) {
    return prisma.$transaction(async (tx) => {
      // mark token used only if still valid
      const used = await tx.emailVerificationToken.updateMany({
        where: {
          id: args.tokenId,
          tokenHash: args.tokenHash,
          usedAt: null,
          expiresAt: { gt: args.now },
        },
        data: { usedAt: args.now },
      });

      if (used.count === 0) return false;

      // mark user verified (idempotent)
      await tx.usuario.update({
        where: { id: args.userId },
        data: { emailVerifiedAt: args.now },
      });

      // invalidate other tokens
      await tx.emailVerificationToken.updateMany({
        where: {
          userId: args.userId,
          usedAt: null,
          expiresAt: { gt: args.now },
          NOT: { id: args.tokenId },
        },
        data: { usedAt: args.now },
      });

      return true;
    });
  }

  async applyEmailVerificationByCode(args: {
    tokenId: string;
    userId: string;
    codeHash: string;
    now: Date;
  }) {
    return prisma.$transaction(async (tx) => {
      // mark token used only if still valid (code path)
      const used = await tx.emailVerificationToken.updateMany({
        where: {
          id: args.tokenId,
          codeHash: args.codeHash,
          usedAt: null,
          expiresAt: { gt: args.now },
        },
        data: { usedAt: args.now },
      });

      if (used.count === 0) return false;

      // mark user verified (idempotent)
      await tx.usuario.update({
        where: { id: args.userId },
        data: { emailVerifiedAt: args.now },
      });

      // invalidate other tokens
      await tx.emailVerificationToken.updateMany({
        where: {
          userId: args.userId,
          usedAt: null,
          expiresAt: { gt: args.now },
          NOT: { id: args.tokenId },
        },
        data: { usedAt: args.now },
      });

      return true;
    });
  }
}

export const authRepository = new AuthRepository();
