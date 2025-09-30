import { hash, verify } from "argon2"

/**
 * Hash a password using Argon2id (recommended for password hashing)
 */
export const hashPassword = async (password: string): Promise<string> => {
  return hash(password, {
    type: 2, // Argon2id
    memoryCost: 2 ** 16, // 64 MB
    timeCost: 3, // 3 iterations
    parallelism: 1, // 1 thread
  })
}

/**
 * Verify a password against its hash
 */
export const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
  try {
    return await verify(hash, password)
  } catch (error) {
    return false
  }
}

// Legacy export for backward compatibility
export const comparePassword = verifyPassword
