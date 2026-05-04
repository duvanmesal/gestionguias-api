import type { SessionInfo } from "../_domain/auth.types"
import { authRepository } from "../_data/auth.repository"

export async function listSessionsUsecase(
  userId: string,
  currentSessionId?: string,
): Promise<SessionInfo[]> {
  const sessions = await authRepository.listActiveSessions(userId)
  return sessions.map((session) => ({
    ...session,
    isCurrent: currentSessionId ? session.id === currentSessionId : false,
  }))
}
