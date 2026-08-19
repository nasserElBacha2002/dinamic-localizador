import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import sql from "mssql";
import { env } from "../config/env";
import { getPool } from "../database/connection";
import { AppError } from "../errors/app-error";
import { twoFactorChallengeRepository } from "../repositories/two-factor-challenge.repository";
import { twoFactorRecoveryCodeRepository } from "../repositories/two-factor-recovery-code.repository";
import { toPublicUser, userRepository } from "../repositories/user.repository";
import type {
  PublicUser,
  TwoFactorChallengePayload,
  TwoFactorSetupResult,
  TwoFactorStatus,
  User,
} from "../types/auth";
import {
  TWO_FACTOR_CHALLENGE_AUDIENCE,
  TWO_FACTOR_CHALLENGE_ISSUER,
  TWO_FACTOR_CHALLENGE_PURPOSE,
} from "../types/auth";
import { signSessionToken } from "../utils/auth-token";
import { hashOpaqueToken } from "../utils/opaque-token";
import { verifyPassword } from "../utils/password";
import { decryptProtectedSecret, encryptProtectedSecret } from "../utils/protected-secret";
import { generateRecoveryCodes, hashRecoveryCode } from "../utils/recovery-code";
import { rollbackTransactionSafely } from "../utils/sql-transaction";
import { buildTotpUri, createTotpSecret, verifyTotpCode } from "../utils/totp";

const GENERIC_TWO_FACTOR_FAILURE = new AppError(
  401,
  "INVALID_TWO_FACTOR_CODE",
  "Código de autenticación inválido.",
);

const GENERIC_CHALLENGE_FAILURE = new AppError(
  401,
  "INVALID_TWO_FACTOR_CHALLENGE",
  "El desafío de autenticación no es válido o expiró.",
);

export async function issueLoginChallenge(user: User): Promise<string> {
  const challengeId = randomUUID();
  const expiresInMinutes = env.TWO_FACTOR_CHALLENGE_TTL_MINUTES;
  const token = jwt.sign(
    {
      purpose: TWO_FACTOR_CHALLENGE_PURPOSE,
      userId: user.id,
      tokenVersion: user.tokenVersion,
      challengeId,
    } satisfies TwoFactorChallengePayload,
    env.TWO_FACTOR_CHALLENGE_SECRET,
    {
      expiresIn: `${expiresInMinutes}m`,
      audience: TWO_FACTOR_CHALLENGE_AUDIENCE,
      issuer: TWO_FACTOR_CHALLENGE_ISSUER,
      jwtid: challengeId,
    },
  );
  await twoFactorChallengeRepository.insert({
    id: challengeId,
    userId: user.id,
    tokenHash: hashOpaqueToken(token),
    expiresAt: new Date(Date.now() + expiresInMinutes * 60_000),
  });
  return token;
}

function verifyChallengeJwt(challengeToken: string): TwoFactorChallengePayload {
  try {
    const payload = jwt.verify(challengeToken, env.TWO_FACTOR_CHALLENGE_SECRET, {
      audience: TWO_FACTOR_CHALLENGE_AUDIENCE,
      issuer: TWO_FACTOR_CHALLENGE_ISSUER,
    }) as jwt.JwtPayload & Partial<TwoFactorChallengePayload>;
    if (
      payload.purpose !== TWO_FACTOR_CHALLENGE_PURPOSE ||
      typeof payload.userId !== "string" ||
      typeof payload.challengeId !== "string" ||
      typeof payload.tokenVersion !== "number"
    ) {
      throw GENERIC_CHALLENGE_FAILURE;
    }
    return {
      purpose: TWO_FACTOR_CHALLENGE_PURPOSE,
      userId: payload.userId,
      tokenVersion: payload.tokenVersion,
      challengeId: payload.challengeId,
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw GENERIC_CHALLENGE_FAILURE;
  }
}

function decryptUserSecret(user: User): string {
  if (!user.twoFactorSecretEncrypted) {
    throw new AppError(400, "TWO_FACTOR_NOT_CONFIGURED", "La autenticación en dos pasos no está configurada.");
  }
  try {
    return decryptProtectedSecret(user.twoFactorSecretEncrypted);
  } catch {
    throw new AppError(500, "TWO_FACTOR_SECRET_UNREADABLE", "No se pudo validar el segundo factor.");
  }
}

async function persistRecoveryCodes(userId: string, transaction: sql.Transaction): Promise<string[]> {
  const codes = generateRecoveryCodes();
  await twoFactorRecoveryCodeRepository.replaceAllForUser(
    userId,
    codes.map((code) => hashRecoveryCode(code)),
    transaction,
  );
  return codes;
}

/** A consumed TOTP step cannot authorize a second sensitive action. */
async function consumeTotpIfFresh(
  user: User,
  code: string,
  transaction: sql.Transaction,
  timestamp = Date.now(),
): Promise<number> {
  const secret = decryptUserSecret(user);
  const usedStep = verifyTotpCode(secret, user.email, code, timestamp);
  if (usedStep === null) {
    throw GENERIC_TWO_FACTOR_FAILURE;
  }
  if (user.twoFactorLastUsedStep !== null && usedStep <= user.twoFactorLastUsedStep) {
    throw GENERIC_TWO_FACTOR_FAILURE;
  }
  const marked = await userRepository.markTotpStepUsed(
    user.id,
    usedStep,
    user.twoFactorLastUsedStep,
    transaction,
  );
  if (!marked) {
    throw GENERIC_TWO_FACTOR_FAILURE;
  }
  return usedStep;
}

export const twoFactorService = {
  async startSetup(userId: string): Promise<TwoFactorSetupResult> {
    const existing = await userRepository.findById(userId);
    if (!existing || !existing.active) {
      throw new AppError(403, "USER_INACTIVE", "Usuario inactivo o no encontrado.");
    }
    if (existing.twoFactorEnabled) {
      throw new AppError(
        409,
        "TWO_FACTOR_ALREADY_ENABLED",
        "La autenticación en dos pasos ya está activa. Desactivala para volver a configurarla.",
      );
    }

    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const user = await userRepository.lockByIdForUpdate(userId, transaction);
      if (!user || !user.active) {
        throw new AppError(403, "USER_INACTIVE", "Usuario inactivo o no encontrado.");
      }
      if (user.twoFactorEnabled) {
        throw new AppError(
          409,
          "TWO_FACTOR_ALREADY_ENABLED",
          "La autenticación en dos pasos ya está activa. Desactivala para volver a configurarla.",
        );
      }

      const { base32 } = createTotpSecret();
      const encrypted = encryptProtectedSecret(base32);
      const saved = await userRepository.savePendingTwoFactorSecret(user.id, encrypted, transaction);
      if (!saved) {
        throw new AppError(
          409,
          "TWO_FACTOR_ALREADY_ENABLED",
          "La autenticación en dos pasos ya está activa. Desactivala para volver a configurarla.",
        );
      }

      await transaction.commit();
      console.info("[2fa] 2fa_setup_started", { userId: user.id });
      return {
        otpauthUri: buildTotpUri(base32, user.email),
        secret: base32,
      };
    } catch (error) {
      await rollbackTransactionSafely(transaction, { operation: "2fa-setup", entityId: userId }, error);
      throw error;
    }
  },

  async confirmSetup(
    userId: string,
    input: { password: string; code: string },
    timestamp = Date.now(),
  ): Promise<{ recoveryCodes: string[] }> {
    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const user = await userRepository.lockByIdForUpdate(userId, transaction);
      if (!user || !user.active) {
        throw new AppError(403, "USER_INACTIVE", "Usuario inactivo o no encontrado.");
      }
      if (user.twoFactorEnabled) {
        throw new AppError(409, "TWO_FACTOR_ALREADY_ENABLED", "La autenticación en dos pasos ya está activa.");
      }
      if (!user.twoFactorSecretEncrypted) {
        throw new AppError(400, "TWO_FACTOR_NOT_CONFIGURED", "Iniciá la configuración de 2FA primero.");
      }

      const passwordOk = await verifyPassword(input.password, user.passwordHash);
      if (!passwordOk) {
        throw new AppError(401, "INVALID_CREDENTIALS", "Credenciales inválidas.");
      }

      const secret = decryptUserSecret(user);
      const usedStep = verifyTotpCode(secret, user.email, input.code, timestamp);
      if (usedStep === null) {
        throw GENERIC_TWO_FACTOR_FAILURE;
      }
      if (user.twoFactorLastUsedStep !== null && usedStep <= user.twoFactorLastUsedStep) {
        throw GENERIC_TWO_FACTOR_FAILURE;
      }

      await userRepository.enableTwoFactor(user.id, usedStep, transaction);
      const recoveryCodes = await persistRecoveryCodes(user.id, transaction);
      await transaction.commit();
      console.info("[2fa] 2fa_enabled", { userId: user.id });
      return { recoveryCodes };
    } catch (error) {
      await rollbackTransactionSafely(transaction, { operation: "2fa-confirm", entityId: userId }, error);
      throw error;
    }
  },

  async getStatus(userId: string): Promise<TwoFactorStatus> {
    const user = await userRepository.findById(userId);
    if (!user || !user.active) {
      throw new AppError(403, "USER_INACTIVE", "Usuario inactivo o no encontrado.");
    }
    const remainingRecoveryCodes = user.twoFactorEnabled
      ? await twoFactorRecoveryCodeRepository.countUnconsumed(user.id)
      : 0;
    return {
      enabled: user.twoFactorEnabled,
      remainingRecoveryCodes,
    };
  },

  async disable(
    userId: string,
    input: { password: string; code?: string; recoveryCode?: string },
    timestamp = Date.now(),
  ): Promise<void> {
    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const user = await userRepository.lockByIdForUpdate(userId, transaction);
      if (!user || !user.active) {
        throw new AppError(403, "USER_INACTIVE", "Usuario inactivo o no encontrado.");
      }
      if (!user.twoFactorEnabled) {
        throw new AppError(400, "TWO_FACTOR_NOT_CONFIGURED", "La autenticación en dos pasos no está activa.");
      }
      const passwordOk = await verifyPassword(input.password, user.passwordHash);
      if (!passwordOk) {
        throw new AppError(401, "INVALID_CREDENTIALS", "Credenciales inválidas.");
      }
      if (input.recoveryCode) {
        const consumed = await twoFactorRecoveryCodeRepository.consumeValidByHash(
          user.id,
          hashRecoveryCode(input.recoveryCode),
          transaction,
        );
        if (!consumed) {
          throw GENERIC_TWO_FACTOR_FAILURE;
        }
      } else if (input.code) {
        await consumeTotpIfFresh(user, input.code, transaction, timestamp);
      } else {
        throw GENERIC_TWO_FACTOR_FAILURE;
      }

      await userRepository.disableTwoFactor(user.id, transaction);
      await twoFactorRecoveryCodeRepository.deleteAllForUser(user.id, transaction);
      await transaction.commit();
      console.info("[2fa] 2fa_disabled", { userId: user.id });
    } catch (error) {
      await rollbackTransactionSafely(transaction, { operation: "2fa-disable", entityId: userId }, error);
      throw error;
    }
  },

  async regenerateRecoveryCodes(
    userId: string,
    input: { password: string; code: string },
    timestamp = Date.now(),
  ): Promise<{ recoveryCodes: string[] }> {
    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const user = await userRepository.lockByIdForUpdate(userId, transaction);
      if (!user || !user.active) {
        throw new AppError(403, "USER_INACTIVE", "Usuario inactivo o no encontrado.");
      }
      if (!user.twoFactorEnabled) {
        throw new AppError(400, "TWO_FACTOR_NOT_CONFIGURED", "La autenticación en dos pasos no está activa.");
      }
      const passwordOk = await verifyPassword(input.password, user.passwordHash);
      if (!passwordOk) {
        throw new AppError(401, "INVALID_CREDENTIALS", "Credenciales inválidas.");
      }
      await consumeTotpIfFresh(user, input.code, transaction, timestamp);
      const recoveryCodes = await persistRecoveryCodes(user.id, transaction);
      await transaction.commit();
      console.info("[2fa] 2fa_recovery_codes_regenerated", { userId: user.id });
      return { recoveryCodes };
    } catch (error) {
      await rollbackTransactionSafely(
        transaction,
        { operation: "2fa-regenerate-recovery", entityId: userId },
        error,
      );
      throw error;
    }
  },

  async completeLogin(
    input: {
      challengeToken: string;
      code?: string;
      recoveryCode?: string;
    },
    timestamp = Date.now(),
  ): Promise<{ token: string; user: PublicUser }> {
    const challenge = verifyChallengeJwt(input.challengeToken);
    const tokenHash = hashOpaqueToken(input.challengeToken);

    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const user = await userRepository.lockByIdForUpdate(challenge.userId, transaction);
      if (
        !user ||
        !user.active ||
        !user.twoFactorEnabled ||
        user.tokenVersion !== challenge.tokenVersion
      ) {
        throw GENERIC_TWO_FACTOR_FAILURE;
      }

      const consumed = await twoFactorChallengeRepository.consumeValidByHash(
        tokenHash,
        user.id,
        transaction,
      );
      if (!consumed) {
        throw GENERIC_CHALLENGE_FAILURE;
      }

      if (input.recoveryCode) {
        const ok = await twoFactorRecoveryCodeRepository.consumeValidByHash(
          user.id,
          hashRecoveryCode(input.recoveryCode),
          transaction,
        );
        if (!ok) {
          throw GENERIC_TWO_FACTOR_FAILURE;
        }
        console.info("[2fa] 2fa_recovery_code_used", { userId: user.id });
      } else if (input.code) {
        await consumeTotpIfFresh(user, input.code, transaction, timestamp);
      } else {
        throw GENERIC_TWO_FACTOR_FAILURE;
      }

      await userRepository.updateLastLogin(user.id, transaction);
      await transaction.commit();

      const fresh = await userRepository.findById(user.id);
      if (!fresh) {
        throw GENERIC_TWO_FACTOR_FAILURE;
      }
      return {
        token: signSessionToken(fresh),
        user: toPublicUser(fresh),
      };
    } catch (error) {
      await rollbackTransactionSafely(
        transaction,
        { operation: "2fa-login", entityId: challenge.userId },
        error,
      );
      throw error;
    }
  },
};
