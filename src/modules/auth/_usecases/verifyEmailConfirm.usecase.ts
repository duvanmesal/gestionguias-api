import type { Request } from "express";

import { authRepository } from "../_data/auth.repository";
import { normalizeEmail } from "../_domain/auth.mappers";

import {
  hashEmailVerifyCode,
  hashEmailVerifyToken,
} from "../../../libs/crypto";
import { BadRequestError } from "../../../libs/errors";
import { logger } from "../../../libs/logger";
import { logsService } from "../../../libs/logs/logs.service";

export async function verifyEmailConfirmUsecase(
  req: Request,
  input: { token?: string; email?: string; code?: string },
): Promise<{ message: string }> {
  const now = new Date();

  const platform = req.clientPlatform || "WEB";

  const hasToken = !!input.token;
  const hasCode = !!input.email && !!input.code;

  if (!hasToken && !hasCode) {
    throw new BadRequestError("Invalid request");
  }

  if (hasToken) {
    const raw = (input.token || "").trim();
    if (!raw) throw new BadRequestError("Invalid or expired token");

    const tokenHash = hashEmailVerifyToken(raw);

    const candidate = await authRepository.getEmailVerifyCandidate(
      tokenHash,
      now,
    );

    if (!candidate) throw new BadRequestError("Invalid or expired token");
    if (candidate.usedAt || candidate.expiresAt <= now)
      throw new BadRequestError("Invalid or expired token");
    if (!candidate.userActive)
      throw new BadRequestError("Invalid or expired token");

    const applied = await authRepository.applyEmailVerification({
      tokenHash,
      tokenId: candidate.tokenId,
      userId: candidate.userId,
      now,
    });

    if (!applied) throw new BadRequestError("Invalid or expired token");

    logsService.audit(req, {
      event: "auth.verify_email.confirmed",
      target: {
        entity: "User",
        id: String(candidate.userId),
        email: candidate.userEmail,
      },
      meta: { method: "token", platform },
      message: "Email verified",
    });

    logger.info(
      { userId: candidate.userId },
      "[Auth/VerifyEmailConfirm] email verified successfully",
    );

    return { message: "Email verified successfully" };
  }

  // Code-based confirm (mobile)
  const normalizedEmail = normalizeEmail(input.email || "");
  const rawCode = String(input.code || "").trim();

  if (!normalizedEmail) throw new BadRequestError("Invalid or expired code");
  if (!/^[0-9]{6}$/.test(rawCode))
    throw new BadRequestError("Invalid or expired code");

  const codeHash = hashEmailVerifyCode(rawCode);

  const candidate = await authRepository.getEmailVerifyCandidateByEmailAndCode(
    normalizedEmail,
    codeHash,
    now,
  );

  if (!candidate) throw new BadRequestError("Invalid or expired code");
  if (candidate.usedAt || candidate.expiresAt <= now)
    throw new BadRequestError("Invalid or expired code");
  if (!candidate.userActive)
    throw new BadRequestError("Invalid or expired code");

  const applied = await authRepository.applyEmailVerificationByCode({
    tokenId: candidate.tokenId,
    userId: candidate.userId,
    codeHash,
    now,
  });

  if (!applied) throw new BadRequestError("Invalid or expired code");

  logsService.audit(req, {
    event: "auth.verify_email.confirmed",
    target: {
      entity: "User",
      id: String(candidate.userId),
      email: candidate.userEmail,
    },
    meta: { method: "code", platform },
    message: "Email verified",
  });

  logger.info(
    { userId: candidate.userId },
    "[Auth/VerifyEmailConfirm] email verified successfully",
  );

  return { message: "Email verified successfully" };
}
