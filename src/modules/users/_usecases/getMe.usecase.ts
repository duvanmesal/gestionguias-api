import { NotFoundError } from "../../../libs/errors"
import { userRepository } from "../_data/user.repository"

export async function getMeUsecase(userId: string) {
  const user = await userRepository.findMe(userId)
  if (!user) throw new NotFoundError("User not found")
  return user
}