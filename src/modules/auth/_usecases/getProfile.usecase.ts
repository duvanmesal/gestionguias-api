import { authRepository } from "../_data/auth.repository"
import { mapUsuarioToAuthUserPublic } from "../_domain/auth.mappers"
import { NotFoundError } from "../../../libs/errors"

export async function getProfileUsecase(userId: string) {
  const user = await authRepository.findUserByIdPublic(userId)
  if (!user) throw new NotFoundError("User not found")

  return mapUsuarioToAuthUserPublic(user)
}