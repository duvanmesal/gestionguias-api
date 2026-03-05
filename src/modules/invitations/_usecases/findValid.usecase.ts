import { invitationRepository } from "../_data/invitation.repository";
import { normalizeEmail } from "../_domain/invitation.rules";

export async function findValidInvitationUsecase(emailRaw: string) {
  const email = normalizeEmail(emailRaw);
  return invitationRepository.findValidByEmail(email);
}