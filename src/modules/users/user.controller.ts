import express from "express";
import type { Request, Response, NextFunction } from "express";
import { userService } from "./user.service";
import { ok, created } from "../../libs/http";
import { logger } from "../../libs/logger";
import { BadRequestError } from "../../libs/errors";
import type {
  CreateUserRequest,
  UpdateUserRequest,
  ChangePasswordRequest,
} from "../auth/auth.schemas";
import type {
  CompleteProfileRequest,
  UpdateMeRequest,
  ListGuidesQuery,
  UpdateDisponibilidadGlobalRequest,
  BulkGuiaRequest,
  BulkGuiaUploadQuery,
} from "./user.schemas";
import {
  normalizeHeaderKey,
  parseBooleanCell,
  parseTabularBuffer,
} from "../../libs/bulk/bulk-file";
import type { BulkGuiaItemInput } from "./_usecases/bulkGuides.usecase";

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

  async guides(req: Request, res: Response, next: NextFunction) {
    try {
      const { activo, search, disponible, penalizado } = req.query as any;

      const options: ListGuidesQuery = {
        activo: typeof activo === "boolean" ? activo : undefined,
        disponible: typeof disponible === "boolean" ? disponible : undefined,
        penalizado: typeof penalizado === "boolean" ? penalizado : undefined,
        search: typeof search === "string" ? search : undefined,
      } as any;

      const data = await userService.listGuidesLookup(options);
      res.json(ok(data));
    } catch (error) {
      next(error);
    }
  }

  async bulkGuides(req: Request, res: Response, next: NextFunction) {
    try {
      const body = req.body as BulkGuiaRequest
      const result = await userService.bulkGuides(body)
      res.status(200).json({ data: result, meta: null, error: null })
    } catch (error) {
      next(error)
    }
  }

  async bulkGuidesFile(req: Request, res: Response, next: NextFunction) {
    try {
      const query = req.query as unknown as BulkGuiaUploadQuery

      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        throw new BadRequestError("Se esperaba un archivo CSV o XLSX en el body")
      }

      const parsed = parseTabularBuffer({
        buffer: req.body,
        contentType: req.headers["content-type"],
      })
      const items: BulkGuiaItemInput[] = parsed.rows.map((r) => {
        const out: BulkGuiaItemInput = {}
        for (const [k, v] of Object.entries(r)) {
          const nk = normalizeHeaderKey(k)
          const val = String(v ?? "").trim()
          if (!val) continue
          if (nk === "email") out.email = val
          else if (nk === "nombres") out.nombres = val
          else if (nk === "apellidos") out.apellidos = val
          else if (nk === "telefono") out.telefono = val
          else if (nk === "documenttype" || nk === "tipodocumento") out.documentType = val
          else if (nk === "documentnumber" || nk === "numerodocumento") out.documentNumber = val
          else if (nk === "direccion") out.direccion = val
          else if (nk === "activo") out.activo = parseBooleanCell(val)
          else if (nk === "disponibleparaturnos" || nk === "disponible") out.disponibleParaTurnos = parseBooleanCell(val)
        }
        return out
      })

      const result = await userService.bulkGuides({ mode: query.mode, dryRun: query.dryRun, sendInvites: query.sendInvites, items })
      res.status(200).json({ data: result, meta: null, error: null })
    } catch (error) {
      next(error)
    }
  }

  async getMyDisponibilidad(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const data = await userService.getMyDisponibilidad(userId);
      res.json(ok(data));
    } catch (error) {
      next(error);
    }
  }

  async updateMyDisponibilidad(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const data = req.body as UpdateDisponibilidadGlobalRequest;
      const result = await userService.updateMyDisponibilidad(req, userId, data);
      res.json(ok(result));
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const data = req.body as CreateUserRequest;
      const createdBy = req.user!.userId;

      // ✅ pass req
      const user = await userService.create(req, data, createdBy);

      logger.info(
        { userId: user.id, email: user.email, rol: user.rol, createdBy },
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

      // ✅ pass req
      const user = await userService.update(
        req,
        id,
        data,
        updatedBy,
        updaterRole,
      );

      logger.info(
        { userId: id, updatedBy, changes: Object.keys(data) },
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

      // ✅ pass req
      const user = await userService.updateMe(req, userId, data);

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

      // ✅ pass req
      await userService.changePassword(req, id, data, requesterId);

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }

  async deactivate(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const deactivatedBy = req.user!.userId;

      // ✅ pass req
      await userService.deactivate(req, id, deactivatedBy);

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }

  async activate(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const activatedBy = req.user!.userId;

      // ✅ pass req
      await userService.activate(req, id, activatedBy);

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

      // ✅ pass req
      const user = await userService.completeProfile(req, userId, data);

      logger.info(
        { userId, profileStatus: user.profileStatus },
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
