import type { Request } from "express";

import { authRepository } from "../_data/auth.repository";
import { normalizeEmail } from "../_domain/auth.mappers";

import {
  generateEmailVerifyCode,
  generateEmailVerifyToken,
  hashEmailVerifyCode,
  hashEmailVerifyToken,
} from "../../../libs/crypto";
import { sendVerifyEmailEmail } from "../../../libs/email";
import { logger } from "../../../libs/logger";
import { logsService } from "../../../libs/logs/logs.service";
import { env } from "../../../config/env";

export async function verifyEmailRequestUsecase(
  req: Request,
  email: string,
): Promise<void> {
  const normalizedEmail = normalizeEmail(email);

  const platform = req.clientPlatform || "WEB";

  const user =
    await authRepository.findUserByEmailForEmailVerification(normalizedEmail);

  logsService.audit(req, {
    event: "auth.verify_email.requested",
    target: { entity: "User", email: normalizedEmail },
    meta: { found: !!user, active: !!user?.activo, platform },
    message: "Verify email requested",
  });

  if (!user || !user.activo) {
    logger.info(
      { email: normalizedEmail, found: !!user },
      "[Auth/VerifyEmailRequest] no-op",
    );
    return;
  }

  if (user.emailVerifiedAt) {
    logger.info(
      { userId: user.id },
      "[Auth/VerifyEmailRequest] already verified (no-op)",
    );
    logsService.audit(req, {
      event: "auth.verify_email.already_verified",
      target: { entity: "User", id: String(user.id), email: user.email },
      message: "Email already verified",
    });
    return;
  }

  const ttlMinutes = env.EMAIL_VERIFY_TTL_MINUTES;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000);

  const token = generateEmailVerifyToken();
  const tokenHash = hashEmailVerifyToken(token);

  const code = platform === "MOBILE" ? generateEmailVerifyCode() : undefined;
  const codeHash = code ? hashEmailVerifyCode(code) : undefined;

  await authRepository.invalidateActiveEmailVerificationTokens(user.id, now);
  await authRepository.createEmailVerificationToken({
    userId: user.id,
    tokenHash,
    codeHash,
    expiresAt,
  });

  const verifyUrl = `${env.APP_VERIFY_EMAIL_URL}?token=${encodeURIComponent(token)}`;

  await sendVerifyEmailEmail({
    to: user.email,
    verifyUrl,
    ttlMinutes,
    code,
  });

  logsService.audit(req, {
    event: "auth.verify_email.sent",
    target: { entity: "User", id: String(user.id), email: user.email },
    meta: {
      expiresAt: expiresAt.toISOString(),
      platform,
      mode: platform === "MOBILE" ? "code+link" : "link",
    },
    message: "Verification email sent",
  });

  logger.info(
    { userId: user.id, expiresAt },
    "[Auth/VerifyEmailRequest] verification email sent",
  );
}
