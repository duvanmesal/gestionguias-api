import { hash as argonHash, verify as argonVerify, argon2id } from "argon2";

const PASSWORD_PEPPER = process.env.PASSWORD_PEPPER ?? "";

/**
 * Hash con Argon2id + pepper
 */
export async function hashPassword(password: string): Promise<string> {
  const toHash = `${password}${PASSWORD_PEPPER}`;
  return argonHash(toHash, {
    type: argon2id,     // Argon2id recomendado
    memoryCost: 2 ** 16, // 64 MiB
    timeCost: 3,         // 3 iteraciones
    parallelism: 1,      // 1 hilo
  });
}

/**
 * Verifica con Argon2id + pepper
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    const candidate = `${password}${PASSWORD_PEPPER}`;
    return await argonVerify(hash, candidate);
  } catch {
    return false;
  }
}

// compat
export const comparePassword = verifyPassword;
