import { NotFoundError } from "../../../libs/errors"
import { userRepository } from "../_data/user.repository"

export async function getUserUsecase(id: string) {
  const user = await userRepository.findByIdDetail(id)
  if (!user) throw new NotFoundError("User not found")
  return user
}