import type { Request } from "express";

import { env } from "../../../config/env";
import { generateLogoutAllCode, hashLogoutAllCode } from "../../../libs/crypto";
import { sendLogoutAllCodeEmail } from "../../../libs/email";
import { UnauthorizedError } from "../../../libs/errors";
import { logsService } from "../../../libs/logs/logs.service";
import { authRepository } from "../_data/auth.repository";

export async function requestLogoutAllCodeUsecase(
  req: Request,
  userId: string,
): Promise<void> {
  const user = await authRepository.findUserByIdForLogoutAllCode(userId);
  if (!user || !user.activo) {
    throw new UnauthorizedError("User not found or inactive");
  }

  const ttlMinutes = env.LOGOUT_ALL_CODE_TTL_MINUTES;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000);
  const code = generateLogoutAllCode();
  const codeHash = hashLogoutAllCode(code);

  await authRepository.invalidateActiveLogoutAllCodes(user.id, now);
  await authRepository.createLogoutAllVerificationCode({
    userId: user.id,
    codeHash,
    expiresAt,
  });

  await sendLogoutAllCodeEmail({
    to: user.email,
    code,
    ttlMinutes,
  });

  logsService.audit(req, {
    event: "auth.logout_all.code_sent",
    target: { entity: "User", id: String(user.id), email: user.email },
    meta: {
      platform: req.clientPlatform || "UNKNOWN",
      expiresAt: expiresAt.toISOString(),
    },
    message: "Logout-all verification code sent",
  });
}
