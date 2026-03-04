import type { SessionInfo } from "../_domain/auth.types"
import { authRepository } from "../_data/auth.repository"

export async function listSessionsUsecase(userId: string): Promise<SessionInfo[]> {
  const sessions = await authRepository.listActiveSessions(userId)
  return sessions
}