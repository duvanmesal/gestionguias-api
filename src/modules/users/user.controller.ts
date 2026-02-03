import type { Request, Response, NextFunction } from "express";
import { userService } from "./user.service";
import { ok, created } from "../../libs/http";
import { logger } from "../../libs/logger";
import type {
  CreateUserRequest,
  UpdateUserRequest,
  ChangePasswordRequest,
} from "../auth/auth.schemas";
import type { CompleteProfileRequest, UpdateMeRequest } from "./user.schemas";
import type { RolType, ProfileStatus } from "@prisma/client";

export class UserController {
  async me(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;

      const user = await userService.getMe(userId);

      res.json(ok(user));
    } catch (error) {
      next(error);
    }
  }

  async list(req: Request, res: Response, next: NextFunction) {
    try {
      /**
       * Con validate({ query: listUsersQuerySchema })
       * lo ideal es que esto YA venga parseado:
       * - page/pageSize => number
       * - activo => boolean | undefined
       * - createdFrom/... => Date | undefined
       */
      const {
        page,
        pageSize,
        search,
        rol,
        activo,
        profileStatus,
        createdFrom,
        createdTo,
        updatedFrom,
        updatedTo,
        orderBy,
        orderDir,
      } = req.query as any;

      const options = {
        page,
        pageSize,
        search,
        rol: rol as RolType,
        activo: typeof activo === "boolean" ? activo : undefined,
        profileStatus: profileStatus as ProfileStatus,
        createdFrom: createdFrom as Date | undefined,
        createdTo: createdTo as Date | undefined,
        updatedFrom: updatedFrom as Date | undefined,
        updatedTo: updatedTo as Date | undefined,
        orderBy: orderBy as "createdAt" | "updatedAt" | "email" | undefined,
        orderDir: orderDir as "asc" | "desc" | undefined,
      };

      const result = await userService.list(options);

      res.json(ok(result.data, result.meta));
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const data = req.body as CreateUserRequest;
      const createdBy = req.user!.userId;

      const user = await userService.create(data, createdBy);

      logger.info(
        {
          userId: user.id,
          email: user.email,
          rol: user.rol,
          createdBy,
        },
        "User created successfully",
      );

      res.status(201).json(created(user));
    } catch (error) {
      next(error);
    }
  }

  async get(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const user = await userService.get(id);

      res.json(ok(user));
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const data = req.body as UpdateUserRequest;
      const updatedBy = req.user!.userId;
      const updaterRole = req.user!.rol as RolType;

      const user = await userService.update(id, data, updatedBy, updaterRole);

      logger.info(
        {
          userId: id,
          updatedBy,
          changes: Object.keys(data),
        },
        "User updated successfully",
      );

      res.json(ok(user));
    } catch (error) {
      next(error);
    }
  }

  async updateMe(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const data = req.body as UpdateMeRequest;

      const user = await userService.updateMe(userId, data);

      logger.info(
        { userId, changes: Object.keys(data) },
        "Profile updated successfully (me)",
      );

      res.json(ok(user));
    } catch (error) {
      next(error);
    }
  }

  async changePassword(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const data = req.body as ChangePasswordRequest;
      const requesterId = req.user!.userId;

      await userService.changePassword(id, data, requesterId);

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }

  async deactivate(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const deactivatedBy = req.user!.userId;

      await userService.deactivate(id, deactivatedBy);

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }

  async activate(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const activatedBy = req.user!.userId;

      await userService.activate(id, activatedBy);

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }

  async completeProfile(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const data = req.body as CompleteProfileRequest;
      const userId = req.user.userId;

      const user = await userService.completeProfile(userId, data);

      logger.info(
        {
          userId,
          profileStatus: user.profileStatus,
        },
        "Profile completed successfully",
      );

      res.json(ok(user));
      return;
    } catch (error) {
      next(error);
      return;
    }
  }
}

export const userController = new UserController();
