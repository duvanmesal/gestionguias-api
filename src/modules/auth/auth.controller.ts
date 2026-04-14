import type { Request, Response, NextFunction } from "express";
import type { Platform } from "@prisma/client";

import { authService } from "./auth.service";
import { ok, created } from "../../libs/http";
import { logger } from "../../libs/logger";
import { BadRequestError } from "../../libs/errors";

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

const REFRESH_COOKIE_PATH = (process.env.API_PREFIX || "") + "/auth/refresh";

const REFRESH_COOKIE_BASE = {
  httpOnly: true,
  secure: true,
  sameSite: "strict" as const,
  path: REFRESH_COOKIE_PATH,
};

export class AuthController {
  async login(req: Request, res: Response, next: NextFunction) {
    try {
      logger.info(
        {
          hasBody: !!req.body,
          email: (req.body as any)?.email,
          platformHeader: req.get("X-Client-Platform"),
          clientPlatform: req.clientPlatform,
          ip: req.ip,
          userAgent: req.get("User-Agent"),
        },
        "[Auth/Login] incoming",
      );

      if (!req.clientPlatform) {
        throw new BadRequestError("X-Client-Platform header is required");
      }

      const data = req.body as LoginRequest;
      const platform = req.clientPlatform as Platform;
      const ip = req.ip;
      const userAgent = req.get("User-Agent");

      const result = await authService.login(
        req,
        data,
        platform,
        ip,
        userAgent,
      );

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
          ...REFRESH_COOKIE_BASE,
          maxAge: 30 * 24 * 60 * 60 * 1000,
        });

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
      if (!req.clientPlatform) {
        throw new BadRequestError("X-Client-Platform header is required");
      }

      const platform = req.clientPlatform as Platform;
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
        req,
        refreshToken,
        platform,
        ip,
        userAgent,
      );

      if (platform === "WEB" && result.tokens.refreshToken) {
        res.cookie("rt", result.tokens.refreshToken, {
          ...REFRESH_COOKIE_BASE,
          maxAge: 30 * 24 * 60 * 60 * 1000,
        });

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
      if (!req.user?.sid) {
        throw new BadRequestError("Session ID not found in token");
      }

      const platform = req.clientPlatform as Platform;
      await authService.logout(req, req.user.sid);

      if (platform === "WEB") {
        res.clearCookie("rt", REFRESH_COOKIE_BASE);
      }

      return res.status(204).send();
    } catch (error) {
      return next(error);
    }
  }

  async logoutAll(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const body = req.body as LogoutAllRequest;
      if (!body?.verification) {
        throw new BadRequestError("verification object is required");
      }

      await authService.logoutAll(req, req.user.userId, body.verification);

      if (req.clientPlatform === "WEB") {
        res.clearCookie("rt", REFRESH_COOKIE_BASE);
      }

      return res.status(204).send();
    } catch (error) {
      return next(error);
    }
  }

  async sessions(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const sessions = await authService.listSessions(req.user.userId);
      return res.json(ok({ sessions }));
    } catch (error) {
      return next(error);
    }
  }

  async revokeSession(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { sessionId } = req.params;
      if (!sessionId) {
        throw new BadRequestError("Session ID is required");
      }

      await authService.revokeSession(sessionId, req.user.userId);
      return res.status(204).send();
    } catch (error) {
      return next(error);
    }
  }

  async changePassword(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const body = req.body as ChangePasswordRequest;
      const current = body.oldPassword ?? body.currentPassword;
      if (!current) {
        throw new BadRequestError("oldPassword/currentPassword is required");
      }

      await authService.changePassword(
        req,
        req.user.userId,
        current,
        body.newPassword,
      );

      return res.json(ok({ message: "Password changed successfully" }));
    } catch (error) {
      return next(error);
    }
  }

  async forgotPassword(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.clientPlatform) {
        throw new BadRequestError("X-Client-Platform header is required");
      }

      const body = req.body as ForgotPasswordRequest;

      logger.info(
        {
          email: body.email,
          platformHeader: req.get("X-Client-Platform"),
          clientPlatform: req.clientPlatform,
          ip: req.ip,
          userAgent: req.get("User-Agent"),
        },
        "[Auth/ForgotPassword] incoming",
      );

      await authService.forgotPassword(req, body.email);

      return res.json(
        ok({
          message: "If the email exists, a recovery message has been sent",
        }),
      );
    } catch (error) {
      return next(error);
    }
  }

  async resetPassword(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.clientPlatform) {
        throw new BadRequestError("X-Client-Platform header is required");
      }

      const body = req.body as ResetPasswordRequest;

      logger.info(
        {
          hasToken: !!body.token,
          platformHeader: req.get("X-Client-Platform"),
          clientPlatform: req.clientPlatform,
          ip: req.ip,
          userAgent: req.get("User-Agent"),
        },
        "[Auth/ResetPassword] incoming",
      );

      await authService.resetPassword(req, body.token, body.newPassword);

      return res.json(ok({ message: "Password updated successfully" }));
    } catch (error) {
      return next(error);
    }
  }

  async verifyEmailRequest(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.clientPlatform) {
        throw new BadRequestError("X-Client-Platform header is required");
      }

      const body = req.body as VerifyEmailRequest;

      logger.info(
        {
          email: body.email,
          platformHeader: req.get("X-Client-Platform"),
          clientPlatform: req.clientPlatform,
          ip: req.ip,
          userAgent: req.get("User-Agent"),
        },
        "[Auth/VerifyEmailRequest] incoming",
      );

      await authService.verifyEmailRequest(req, body.email);

      return res.json(
        ok({
          message: "If the email exists, a verification message has been sent",
        }),
      );
    } catch (error) {
      return next(error);
    }
  }

  async verifyEmailConfirm(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.clientPlatform) {
        throw new BadRequestError("X-Client-Platform header is required");
      }

      const body = req.body as VerifyEmailConfirmRequest;

      const hasToken = !!(body as any)?.token;
      const hasCode = !!(body as any)?.email && !!(body as any)?.code;

      logger.info(
        {
          hasToken,
          hasCode,
          platformHeader: req.get("X-Client-Platform"),
          clientPlatform: req.clientPlatform,
          ip: req.ip,
          userAgent: req.get("User-Agent"),
        },
        "[Auth/VerifyEmailConfirm] incoming",
      );

      const result = await authService.verifyEmailConfirm(req, body);

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
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const user = await authService.getProfile(req.user.userId);
      return res.json(ok(user));
    } catch (error) {
      return next(error);
    }
  }
}

export const authController = new AuthController();
