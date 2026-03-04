import type { Request } from "express"
import type { RolType } from "@prisma/client"

import type {
  CreateUserRequest,
  UpdateUserRequest,
  ChangePasswordRequest,
} from "../auth/auth.schemas"

import type {
  CompleteProfileRequest,
  UpdateMeRequest,
  ListGuidesQuery,
} from "./user.schemas"

import type { PaginationOptions } from "./_domain/user.types"
export type { PaginationOptions, PaginatedResult } from "./_domain/user.types"

import { getMeUsecase } from "./_usecases/getMe.usecase"
import { listUsersUsecase } from "./_usecases/list.usecase"
import { listGuidesLookupUsecase } from "./_usecases/listGuidesLookup.usecase"
import { createUserUsecase } from "./_usecases/create.usecase"
import { updateMeUsecase } from "./_usecases/updateMe.usecase"
import { getUserUsecase } from "./_usecases/get.usecase"
import { updateUserUsecase } from "./_usecases/update.usecase"
import { changePasswordUsecase } from "./_usecases/changePassword.usecase"
import { deactivateUserUsecase } from "./_usecases/deactivate.usecase"
import { activateUserUsecase } from "./_usecases/activate.usecase"
import { completeProfileUsecase } from "./_usecases/completeProfile.usecase"

export class UserService {
  // -------- ME --------
  getMe(userId: string) {
    return getMeUsecase(userId)
  }

  updateMe(req: Request, userId: string, data: UpdateMeRequest) {
    return updateMeUsecase(req, userId, data)
  }

  completeProfile(req: Request, userId: string, data: CompleteProfileRequest) {
    return completeProfileUsecase(req, userId, data)
  }

  // -------- LISTS --------
  list(options: PaginationOptions = {}) {
    return listUsersUsecase(options)
  }

  listGuidesLookup(query: ListGuidesQuery) {
    return listGuidesLookupUsecase(query)
  }

  // -------- ADMIN --------
  create(req: Request, data: CreateUserRequest, createdBy: string) {
    return createUserUsecase(req, data, createdBy)
  }

  get(id: string) {
    return getUserUsecase(id)
  }

  update(
    req: Request,
    id: string,
    data: UpdateUserRequest,
    updatedBy: string,
    updaterRole: RolType,
  ) {
    return updateUserUsecase(req, id, data, updatedBy, updaterRole)
  }

  changePassword(
    req: Request,
    id: string,
    data: ChangePasswordRequest,
    requesterId: string,
  ) {
    return changePasswordUsecase(req, id, data, requesterId)
  }

  deactivate(req: Request, id: string, deactivatedBy: string) {
    return deactivateUserUsecase(req, id, deactivatedBy)
  }

  activate(req: Request, id: string, activatedBy: string) {
    return activateUserUsecase(req, id, activatedBy)
  }
}

export const userService = new UserService()