import sql from "mssql";
import { env } from "../config/env";
import { getPool } from "../database/connection";
import { AppError } from "../errors/app-error";
import { passwordResetTokenRepository } from "../repositories/password-reset-token.repository";
import { twoFactorChallengeRepository } from "../repositories/two-factor-challenge.repository";
import { userRepository } from "../repositories/user.repository";
import { withMinimumDuration } from "../utils/minimum-duration";
import { generateOpaqueToken, hashOpaqueToken } from "../utils/opaque-token";
import { hashPassword, normalizeEmail } from "../utils/password";
import { assertPasswordPolicy } from "../utils/password-policy";
import { safeRollback } from "../utils/safe-transaction";
import { isSqlDeadlockError } from "../utils/sql-server-errors";
import { sendEmail } from "./email.service";
import { buildPasswordResetEmail } from "./password-reset-email";

/** Test seam: mock.method(passwordResetMailer, "send", ...). Production uses nodemailer. */
export const passwordResetMailer = {
  send: sendEmail,
};

export const PASSWORD_RESET_PUBLIC_MESSAGE =
  "Si existe una cuenta asociada a ese email, recibirás instrucciones para restablecer tu contraseña.";

export const PASSWORD_RESET_SUCCESS_MESSAGE =
  "Contraseña actualizada correctamente. Iniciá sesión nuevamente.";

const INVALID_RESET_TOKEN_ERROR = new AppError(
  400,
  "INVALID_PASSWORD_RESET_TOKEN",
  "El enlace de restablecimiento no es válido o ya no está disponible.",
);

const RESET_CONFLICT_ERROR = new AppError(
  409,
  "PASSWORD_RESET_CONFLICT",
  "No se pudo completar el restablecimiento. Reintentá.",
);

export function passwordResetExpiresAt(now = Date.now()): Date {
  return new Date(now + env.PASSWORD_RESET_TTL_MINUTES * 60 * 1000);
}

async function bestEffortInvalidateIssuedResetToken(input: {
  tokenId: string;
  userId: string;
  reason: string;
}): Promise<void> {
  try {
    await passwordResetTokenRepository.consumeById(input.tokenId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.error("[password-reset] failed to invalidate issued token after delivery failure; token may remain active", {
      userId: input.userId,
      tokenId: input.tokenId,
      reason: input.reason,
      error: message.slice(0, 200),
    });
  }
}

async function issueResetTokenForUser(userId: string): Promise<{
  rawToken: string;
  tokenId: string;
  expiresAt: Date;
}> {
  const rawToken = generateOpaqueToken();
  const tokenHash = hashOpaqueToken(rawToken);
  const expiresAt = passwordResetExpiresAt();

  const pool = getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const locked = await userRepository.lockByIdForUpdate(userId, transaction);
    if (!locked?.active) {
      await transaction.rollback();
      throw new Error("PASSWORD_RESET_USER_UNAVAILABLE");
    }

    await passwordResetTokenRepository.consumeAllUnconsumedForUser(userId, transaction);
    const inserted = await passwordResetTokenRepository.insert(
      { userId, tokenHash, expiresAt },
      transaction,
    );
    await transaction.commit();
    return { rawToken, tokenId: inserted.id, expiresAt };
  } catch (error) {
    await safeRollback(transaction);
    throw error;
  }
}

export const passwordResetIssuer = {
  issueForUser: issueResetTokenForUser,
};

async function forgotPasswordInner(email: string): Promise<{ message: string }> {
  const normalizedEmail = normalizeEmail(email);
  const user = await userRepository.findByEmail(normalizedEmail);

  if (!user?.active) {
    hashOpaqueToken(generateOpaqueToken());
    return { message: PASSWORD_RESET_PUBLIC_MESSAGE };
  }

  let issued: { rawToken: string; tokenId: string; expiresAt: Date };
  try {
    issued = await passwordResetIssuer.issueForUser(user.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.error("[password-reset] failed to issue token", {
      userId: user.id,
      error: message.slice(0, 200),
    });
    return { message: PASSWORD_RESET_PUBLIC_MESSAGE };
  }

  const content = buildPasswordResetEmail({
    to: user.email,
    expiresAt: issued.expiresAt,
    rawToken: issued.rawToken,
  });

  try {
    const result = await passwordResetMailer.send(content);
    if (env.EMAIL_TRANSPORT === "smtp" && !result.sent) {
      await bestEffortInvalidateIssuedResetToken({
        tokenId: issued.tokenId,
        userId: user.id,
        reason: result.publicErrorCode ?? "smtp_not_accepted",
      });
      console.error("[password-reset] email not accepted", {
        userId: user.id,
        tokenId: issued.tokenId,
        code: result.publicErrorCode,
      });
    } else {
      console.info("[password-reset] forgot issued", {
        userId: user.id,
        tokenId: issued.tokenId,
        emailSent: result.sent,
        transport: result.transport,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.error("[password-reset] email send failed", {
      userId: user.id,
      tokenId: issued.tokenId,
      error: message.slice(0, 200),
    });
    await bestEffortInvalidateIssuedResetToken({
      tokenId: issued.tokenId,
      userId: user.id,
      reason: "smtp_throw",
    });
  }

  return { message: PASSWORD_RESET_PUBLIC_MESSAGE };
}

export const passwordResetService = {
  async forgotPassword(email: string): Promise<{ message: string }> {
    return withMinimumDuration(() => forgotPasswordInner(email), {
      minMs: env.PASSWORD_RESET_MIN_DURATION_MS,
      jitterMs: env.PASSWORD_RESET_DURATION_JITTER_MS,
    });
  },

  async resetPassword(rawToken: string, password: string): Promise<{ message: string }> {
    assertPasswordPolicy(password);
    const tokenHash = hashOpaqueToken(rawToken.trim());
    const passwordHash = await hashPassword(password);

    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const preview = await passwordResetTokenRepository.findValidUnconsumedByHash(
        tokenHash,
        transaction,
      );
      if (!preview) {
        await transaction.rollback();
        throw INVALID_RESET_TOKEN_ERROR;
      }

      const user = await userRepository.lockByIdForUpdate(preview.userId, transaction);
      if (!user?.active) {
        await passwordResetTokenRepository.consumeValidByHash(
          tokenHash,
          preview.userId,
          transaction,
        );
        await transaction.commit();
        throw INVALID_RESET_TOKEN_ERROR;
      }

      const consumed = await passwordResetTokenRepository.consumeValidByHash(
        tokenHash,
        user.id,
        transaction,
      );
      if (!consumed) {
        await transaction.rollback();
        throw INVALID_RESET_TOKEN_ERROR;
      }

      await userRepository.updatePasswordAndBumpTokenVersion(
        user.id,
        passwordHash,
        transaction,
      );
      await twoFactorChallengeRepository.deleteAllForUser(user.id, transaction);
      await transaction.commit();
      console.info("[password-reset] password updated", { userId: user.id });
      return { message: PASSWORD_RESET_SUCCESS_MESSAGE };
    } catch (error) {
      await safeRollback(transaction);
      if (error instanceof AppError) {
        throw error;
      }
      if (isSqlDeadlockError(error)) {
        throw RESET_CONFLICT_ERROR;
      }
      throw error;
    }
  },
};
