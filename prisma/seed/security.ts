import { argon2id, hash as argonHash } from "argon2"

import type { SeedContext } from "./context"

export async function hashPassword(context: SeedContext, plain: string) {
  const toHash = `${plain}${context.env.PASSWORD_PEPPER ?? ""}`
  return argonHash(toHash, {
    type: argon2id,
    memoryCost: 2 ** 16,
    timeCost: 3,
    parallelism: 1,
  })
}
