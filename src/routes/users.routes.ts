import express, { Router } from "express";
import { validate } from "../libs/zod-mw";
import { requireAuth, requireOwnershipOrRole } from "../libs/auth";
import { requireSuperAdmin } from "../libs/rbac";
import { requireSupervisor } from "../libs/rbac";
import { requireGuia } from "../libs/rbac";
import { userController } from "../modules/users/user.controller";
import {
  createUserSchema,
  updateUserSchema,
  changePasswordSchema,
  listUsersQuerySchema,
} from "../modules/auth/auth.schemas";
import {
  completeProfileSchema,
  updateMeSchema,
  listGuidesQuerySchema,
  updateDisponibilidadGlobalSchema,
  bulkGuiaRequestSchema,
  bulkGuiaUploadQuerySchema,
} from "../modules/users/user.schemas";
import { RolType } from "@prisma/client";

const router = Router();

// All routes require authentication
router.use(requireAuth);

// ─────────────────────────────────────────────────────────────
// ME endpoints (SELF)
// ─────────────────────────────────────────────────────────────
router.get("/me", userController.me.bind(userController));

router.get(
  "/me/disponibilidad",
  requireGuia,
  userController.getMyDisponibilidad.bind(userController),
);

router.patch(
  "/me/disponibilidad",
  requireGuia,
  validate({ body: updateDisponibilidadGlobalSchema }),
  userController.updateMyDisponibilidad.bind(userController),
);

router.patch(
  "/me/profile",
  validate({ body: completeProfileSchema }),
  userController.completeProfile.bind(userController),
);

router.patch(
  "/me",
  validate({ body: updateMeSchema }),
  userController.updateMe.bind(userController),
);

// ─────────────────────────────────────────────────────────────
// LOOKUPS (SUPERVISOR / SUPER_ADMIN)
// ⚠️ Debe ir ANTES de "/:id"
// ─────────────────────────────────────────────────────────────
/**
 * GET /users/guides
 * Lookup seguro para operación (asignar turnos / turnero)
 * Auth: SUPERVISOR / SUPER_ADMIN
 *
 * Devuelve campos mínimos:
 * - guiaId, nombres, apellidos, email, activo
 *
 * Query opcional:
 * - activo=true|false (default true)
 * - search=texto (filtra por nombres/apellidos/email)
 */
router.get(
  "/guides",
  requireSupervisor,
  validate({ query: listGuidesQuerySchema }),
  userController.guides.bind(userController),
);

// ✅ Bulk Guides JSON
router.post(
  "/guides/bulk",
  requireSuperAdmin,
  validate({ body: bulkGuiaRequestSchema }),
  userController.bulkGuides.bind(userController),
);

// ✅ Bulk Guides File (CSV/XLSX)
router.post(
  "/guides/bulk/file",
  requireSuperAdmin,
  validate({ query: bulkGuiaUploadQuerySchema }),
  express.raw({
    type: [
      "text/csv",
      "text/plain",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/octet-stream",
    ],
    limit: "5mb",
  }),
  userController.bulkGuidesFile.bind(userController),
);

// ─────────────────────────────────────────────────────────────
// LIST & SEARCH (SUPER_ADMIN)
// ⚠️ Deben ir ANTES de "/:id"
// ─────────────────────────────────────────────────────────────
router.get(
  "/search",
  requireSuperAdmin,
  validate({ query: listUsersQuerySchema }),
  userController.list.bind(userController),
);

router.get(
  "/",
  requireSuperAdmin,
  validate({ query: listUsersQuerySchema }),
  userController.list.bind(userController),
);

// ─────────────────────────────────────────────────────────────
// CREATE (SUPER_ADMIN)
// ─────────────────────────────────────────────────────────────
router.post(
  "/",
  requireSuperAdmin,
  validate({ body: createUserSchema }),
  userController.create.bind(userController),
);

// ─────────────────────────────────────────────────────────────
// ID routes (CUID / UUID / cualquier string)
// ─────────────────────────────────────────────────────────────

// Change password - owner only
router.patch(
  "/:id/password",
  requireOwnershipOrRole([]),
  validate({ body: changePasswordSchema }),
  userController.changePassword.bind(userController),
);

// Update user - SUPER_ADMIN or owner (with restrictions)
router.patch(
  "/:id",
  requireOwnershipOrRole([RolType.SUPER_ADMIN]),
  validate({ body: updateUserSchema }),
  userController.update.bind(userController),
);

// Get user - SUPER_ADMIN or owner
router.get(
  "/:id",
  requireOwnershipOrRole([RolType.SUPER_ADMIN]),
  userController.get.bind(userController),
);

// Deactivate user - only SUPER_ADMIN
router.delete(
  "/:id",
  requireSuperAdmin,
  userController.deactivate.bind(userController),
);

export { router as userRoutes };
