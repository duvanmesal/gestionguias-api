import { Router } from "express";
import { validate } from "../libs/zod-mw";
import { requireAuth, requireOwnershipOrRole } from "../libs/auth";
import { requireSuperAdmin } from "../libs/rbac";
import { userController } from "../modules/users/user.controller";
import {
  createUserSchema,
  updateUserSchema,
  changePasswordSchema,
  listUsersQuerySchema,
} from "../modules/auth/auth.schemas";
import { completeProfileSchema, updateMeSchema } from "../modules/users/user.schemas";
import { RolType } from "@prisma/client";

const router = Router();

// All routes require authentication
router.use(requireAuth);

router.patch(
  "/me/profile",
  validate({ body: completeProfileSchema }),
  userController.completeProfile.bind(userController)
);

router.patch(
  "/me",
  validate({ body: updateMeSchema }),
  userController.updateMe.bind(userController)
);

// List users - only SUPER_ADMIN
router.get(
  "/",
  requireSuperAdmin,
  validate({ query: listUsersQuerySchema }),
  userController.list.bind(userController)
);

// Create user - only SUPER_ADMIN
router.post(
  "/",
  requireSuperAdmin,
  validate({ body: createUserSchema }),
  userController.create.bind(userController)
);

// Get user - SUPER_ADMIN or owner
router.get(
  "/:id",
  requireOwnershipOrRole([RolType.SUPER_ADMIN]),
  userController.get.bind(userController)
);

// Update user - SUPER_ADMIN or owner (with restrictions)
router.patch(
  "/:id",
  requireOwnershipOrRole([RolType.SUPER_ADMIN]),
  validate({ body: updateUserSchema }),
  userController.update.bind(userController)
);

// Change password - owner only
router.patch(
  "/:id/password",
  requireOwnershipOrRole([]),
  validate({ body: changePasswordSchema }),
  userController.changePassword.bind(userController)
);

// Deactivate user - only SUPER_ADMIN
router.delete(
  "/:id",
  requireSuperAdmin,
  userController.deactivate.bind(userController)
);

export { router as userRoutes };
