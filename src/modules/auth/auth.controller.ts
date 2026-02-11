import type { Request, Response, NextFunction } from "express";
import { authService } from "./auth.service";
import { ok, created } from "../../libs/http";
import { logger } from "../../libs/logger";
import { BadRequestError, UnauthorizedError } from "../../libs/errors";
import type {
  LoginRequest,
  RefreshRequest,
  RegisterRequest,
  LogoutAllRequest,
  ChangePasswordRequest,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  VerifyEmailRequest,
  VerifyEmailConfirmRequest,
} from "./auth.schemas";
import { verifyPassword } from "../../libs/password";
import type { Platform } from "@prisma/client";
import { prisma } from "../../prisma/client";

const REFRESH_COOKIE_PATH = (process.env.API_PREFIX || "") + "/auth/refresh";

export class AuthController {
  async login(req: Request, res: Response, next: NextFunction) {
    try {
      logger.info(
        {
          hasBody: !!req.body,
          email: (req.body as any)?.email,
          platformHeader: req.get("X-Client-Platform"),
          clientPlatform: (req as any).clientPlatform,
          ip: req.ip,
          userAgent: req.get("User-Agent"),
        },
        "[Auth/Login] incoming",
      );

      if (!(req as any).clientPlatform) {
        throw new BadRequestError("X-Client-Platform header is required");
      }

      const data = req.body as LoginRequest;
      const platform = (req as any).clientPlatform as Platform;
      const ip = req.ip;
      const userAgent = req.get("User-Agent");

      const result = await authService.login(data, platform, ip, userAgent);

      logger.info(
        {
          userId: result.user.id,
          email: result.user.email,
          platform,
          ip,
          userAgent,
        },
        "Login successful",
      );

      if (platform === "WEB" && result.tokens.refreshToken) {
        res.cookie("rt", result.tokens.refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          path: REFRESH_COOKIE_PATH,
          maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        });

        // Remove refreshToken from response body for web
        const { refreshToken, ...tokensWithoutRT } = result.tokens;
        return res.json(ok({ ...result, tokens: tokensWithoutRT }));
      }

      return res.json(ok(result));
    } catch (error) {
      return next(error);
    }
  }

  async refresh(req: Request, res: Response, next: NextFunction) {
    try {
      if (!(req as any).clientPlatform) {
        throw new BadRequestError("X-Client-Platform header is required");
      }

      const platform = (req as any).clientPlatform as Platform;
      const ip = req.ip;
      const userAgent = req.get("User-Agent");

      let refreshToken: string | undefined;

      if (platform === "WEB") {
        refreshToken = (req as any).cookies?.rt;
        if (!refreshToken) {
          throw new BadRequestError("Refresh token cookie not found");
        }
      } else {
        const body = req.body as RefreshRequest;
        refreshToken = body.refreshToken;
        if (!refreshToken) {
          throw new BadRequestError(
            "Refresh token is required in request body for mobile",
          );
        }
      }

      const result = await authService.refresh(
        refreshToken,
        platform,
        ip,
        userAgent,
      );

      if (platform === "WEB" && result.tokens.refreshToken) {
        res.cookie("rt", result.tokens.refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          path: REFRESH_COOKIE_PATH,
          maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        });

        // Remove refreshToken from response body for web
        const { refreshToken: _, ...tokensWithoutRT } = result.tokens;
        return res.json(ok({ ...result, tokens: tokensWithoutRT }));
      }

      return res.json(ok(result));
    } catch (error) {
      return next(error);
    }
  }

  async logout(req: Request, res: Response, next: NextFunction) {
    try {
      if (!(req as any).user?.sid) {
        throw new BadRequestError("Session ID not found in token");
      }

      const platform = (req as any).clientPlatform as Platform;
      await authService.logout((req as any).user.sid);

      if (platform === "WEB") {
        res.clearCookie("rt", {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          path: "/api/v1/auth/refresh",
        });
      }

      return res.status(204).send();
    } catch (error) {
      return next(error);
    }
  }

  async logoutAll(req: Request, res: Response, next: NextFunction) {
    try {
      if (!(req as any).user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const body = req.body as LogoutAllRequest;
      if (!body?.verification) {
        throw new BadRequestError("verification object is required");
      }

      const user = await prisma.usuario.findUnique({
        where: { id: (req as any).user.userId },
      });
      if (!user || !user.activo) {
        throw new UnauthorizedError("User not found or inactive");
      }

      if (body.verification.method === "password") {
        const okPass = await verifyPassword(
          body.verification.password,
          user.passwordHash,
        );
        if (!okPass) throw new UnauthorizedError("Invalid credentials");
      } else if (body.verification.method === "mfa") {
        throw new BadRequestError("MFA verification not implemented");
      } else {
        throw new BadRequestError("Unsupported verification method");
      }

      // Revoca TODAS las sesiones del usuario
      await authService.logoutAll((req as any).user.userId);

      // WEB: limpia la cookie rt
      if ((req as any).clientPlatform === "WEB") {
        res.clearCookie("rt", {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          path: REFRESH_COOKIE_PATH,
        });
      }

      return res.status(204).send();
    } catch (error) {
      return next(error);
    }
  }

  async sessions(req: Request, res: Response, next: NextFunction) {
    try {
      if (!(req as any).user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const sessions = await authService.listSessions((req as any).user.userId);
      return res.json(ok({ sessions }));
    } catch (error) {
      return next(error);
    }
  }

  async revokeSession(req: Request, res: Response, next: NextFunction) {
    try {
      if (!(req as any).user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { sessionId } = req.params;
      if (!sessionId) {
        throw new BadRequestError("Session ID is required");
      }

      await authService.revokeSession(sessionId, (req as any).user.userId);
      return res.status(204).send();
    } catch (error) {
      return next(error);
    }
  }

  // ✅ change-password (requiere auth)
  async changePassword(req: Request, res: Response, next: NextFunction) {
    try {
      if (!(req as any).user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const body = req.body as ChangePasswordRequest;

      // tu schema permite oldPassword o currentPassword
      const current = body.oldPassword ?? body.currentPassword;
      if (!current) {
        throw new BadRequestError("oldPassword/currentPassword is required");
      }

      await authService.changePassword(
        (req as any).user.userId,
        current,
        body.newPassword,
      );

      return res.json(ok({ message: "Password changed successfully" }));
    } catch (error) {
      return next(error);
    }
  }

  // ✅ forgot-password (no requiere auth)
  async forgotPassword(req: Request, res: Response, next: NextFunction) {
    try {
      if (!(req as any).clientPlatform) {
        throw new BadRequestError("X-Client-Platform header is required");
      }

      const body = req.body as ForgotPasswordRequest;

      logger.info(
        {
          email: body.email,
          platformHeader: req.get("X-Client-Platform"),
          clientPlatform: (req as any).clientPlatform,
          ip: req.ip,
          userAgent: req.get("User-Agent"),
        },
        "[Auth/ForgotPassword] incoming",
      );

      await authService.forgotPassword(body.email);

      // Respuesta "ciega" para evitar enumeración de usuarios
      return res.json(
        ok({
          message: "If the email exists, a recovery message has been sent",
        }),
      );
    } catch (error) {
      return next(error);
    }
  }

  // ✅ reset-password (no requiere auth)
  async resetPassword(req: Request, res: Response, next: NextFunction) {
    try {
      if (!(req as any).clientPlatform) {
        throw new BadRequestError("X-Client-Platform header is required");
      }

      const body = req.body as ResetPasswordRequest;

      logger.info(
        {
          hasToken: !!body.token,
          platformHeader: req.get("X-Client-Platform"),
          clientPlatform: (req as any).clientPlatform,
          ip: req.ip,
          userAgent: req.get("User-Agent"),
        },
        "[Auth/ResetPassword] incoming",
      );

      await authService.resetPassword(body.token, body.newPassword);

      // respuesta clara, sin filtrar detalles del token/user
      return res.json(ok({ message: "Password updated successfully" }));
    } catch (error) {
      return next(error);
    }
  }

  // ✅ verify-email/request (no requiere auth)
  async verifyEmailRequest(req: Request, res: Response, next: NextFunction) {
    try {
      if (!(req as any).clientPlatform) {
        throw new BadRequestError("X-Client-Platform header is required");
      }

      const body = req.body as VerifyEmailRequest;

      logger.info(
        {
          email: body.email,
          platformHeader: req.get("X-Client-Platform"),
          clientPlatform: (req as any).clientPlatform,
          ip: req.ip,
          userAgent: req.get("User-Agent"),
        },
        "[Auth/VerifyEmailRequest] incoming",
      );

      await authService.verifyEmailRequest(body.email);

      // Respuesta "ciega" para evitar enumeración
      return res.json(
        ok({
          message: "If the email exists, a verification message has been sent",
        }),
      );
    } catch (error) {
      return next(error);
    }
  }

  // ✅ verify-email/confirm (no requiere auth)
  async verifyEmailConfirm(req: Request, res: Response, next: NextFunction) {
    try {
      if (!(req as any).clientPlatform) {
        throw new BadRequestError("X-Client-Platform header is required");
      }

      const body = req.body as VerifyEmailConfirmRequest;

      logger.info(
        {
          hasToken: !!body.token,
          platformHeader: req.get("X-Client-Platform"),
          clientPlatform: (req as any).clientPlatform,
          ip: req.ip,
          userAgent: req.get("User-Agent"),
        },
        "[Auth/VerifyEmailConfirm] incoming",
      );

      const result = await authService.verifyEmailConfirm(body.token);

      return res.json(ok(result));
    } catch (error) {
      return next(error);
    }
  }


  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const data = req.body as RegisterRequest;
      const result = await authService.register(data);

      logger.info(
        {
          userId: result.user.id,
          email: result.user.email,
          rol: result.user.rol,
        },
        "User registration successful",
      );

      return res.status(201).json(created(result));
    } catch (error) {
      return next(error);
    }
  }

  async me(req: Request, res: Response, next: NextFunction) {
    try {
      if (!(req as any).user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const user = await authService.getProfile((req as any).user.userId);
      return res.json(ok(user));
    } catch (error) {
      return next(error);
    }
  }
}

export const authController = new AuthController();
