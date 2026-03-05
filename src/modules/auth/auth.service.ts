import type { Request } from "express";
import type { Platform, RolType } from "@prisma/client";

import type {
  LoginRequest,
  LogoutAllRequest,
  RegisterRequest,
  VerifyEmailConfirmRequest,
} from "./auth.schemas";

import type {
  LoginResult,
  RefreshResult,
  SessionInfo,
} from "./_domain/auth.types";
export type {
  LoginResult,
  RefreshResult,
  SessionInfo,
} from "./_domain/auth.types";

import { loginUsecase } from "./_usecases/login.usecase";
import { refreshUsecase } from "./_usecases/refresh.usecase";
import { logoutUsecase } from "./_usecases/logout.usecase";
import { logoutAllUsecase } from "./_usecases/logoutAll.usecase";
import { listSessionsUsecase } from "./_usecases/listSessions.usecase";
import { revokeSessionUsecase } from "./_usecases/revokeSession.usecase";
import { registerUsecase } from "./_usecases/register.usecase";
import { getProfileUsecase } from "./_usecases/getProfile.usecase";
import { forgotPasswordUsecase } from "./_usecases/forgotPassword.usecase";
import { resetPasswordUsecase } from "./_usecases/resetPassword.usecase";
import { verifyEmailRequestUsecase } from "./_usecases/verifyEmailRequest.usecase";
import { verifyEmailConfirmUsecase } from "./_usecases/verifyEmailConfirm.usecase";
import { changePasswordUsecase } from "./_usecases/changePassword.usecase";

export class AuthService {
  // -------------------------
  // Sessions + Tokens
  // -------------------------
  login(
    req: Request,
    data: LoginRequest,
    platform: Platform,
    ip?: string,
    userAgent?: string,
  ): Promise<LoginResult> {
    return loginUsecase(req, data, platform, ip, userAgent);
  }

  refresh(
    req: Request,
    refreshToken: string,
    platform: Platform,
    ip?: string,
    userAgent?: string,
  ): Promise<RefreshResult> {
    return refreshUsecase(req, refreshToken, platform, ip, userAgent);
  }

  logout(req: Request, sessionId: string): Promise<void> {
    return logoutUsecase(req, sessionId);
  }

  logoutAll(
    req: Request,
    userId: string,
    verification: LogoutAllRequest["verification"],
  ): Promise<void> {
    return logoutAllUsecase(req, userId, verification);
  }

  listSessions(userId: string): Promise<SessionInfo[]> {
    return listSessionsUsecase(userId);
  }

  revokeSession(sessionId: string, userId: string): Promise<void> {
    return revokeSessionUsecase(sessionId, userId);
  }

  // -------------------------
  // Profile
  // -------------------------
  register(data: RegisterRequest): Promise<{
    user: {
      id: string;
      email: string;
      nombres: string;
      apellidos: string;
      rol: RolType;
    };
  }> {
    return registerUsecase(data);
  }

  getProfile(userId: string) {
    return getProfileUsecase(userId);
  }

  // -------------------------
  // Password flows
  // -------------------------
  forgotPassword(req: Request, email: string): Promise<void> {
    return forgotPasswordUsecase(req, email);
  }

  resetPassword(
    req: Request,
    token: string,
    newPassword: string,
  ): Promise<void> {
    return resetPasswordUsecase(req, token, newPassword);
  }

  changePassword(
    req: Request,
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    return changePasswordUsecase(req, userId, currentPassword, newPassword);
  }

  // -------------------------
  // Email verification
  // -------------------------
  verifyEmailRequest(req: Request, email: string): Promise<void> {
    return verifyEmailRequestUsecase(req, email);
  }

  verifyEmailConfirm(
    req: Request,
    input: VerifyEmailConfirmRequest,
  ): Promise<{ message: string }> {
    return verifyEmailConfirmUsecase(req, input);
  }
}

export const authService = new AuthService();
