import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import jwt from "jsonwebtoken";
import sql from "mssql";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";

setupUnitTestEnv();

import { env } from "../config/env";
import { setTestPool } from "../database/connection";
import { AppError } from "../errors/app-error";
import { twoFactorChallengeRepository } from "../repositories/two-factor-challenge.repository";
import { twoFactorRecoveryCodeRepository } from "../repositories/two-factor-recovery-code.repository";
import { userRepository } from "../repositories/user.repository";
import { issueLoginChallenge, twoFactorService } from "../services/two-factor.service";
import type { User } from "../types/auth";
import { TWO_FACTOR_USER_DEFAULTS } from "../types/auth";
import { hashPassword } from "../utils/password";
import { encryptProtectedSecret } from "../utils/protected-secret";
import { generateTotpCode } from "../utils/totp";

const user: User = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Ops",
  email: "ops@example.com",
  passwordHash: "hash",
  role: "ADMIN",
  isPlatformAdmin: false,
  active: true,
  tokenVersion: 0,
  ...TWO_FACTOR_USER_DEFAULTS,
  lastLoginAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function installFakeSqlTransaction(): () => void {
  const Original = sql.Transaction;
  class FakeTransaction {
    constructor(_pool: unknown) {}
    async begin() {}
    async commit() {}
    async rollback() {}
  }
  (sql as unknown as { Transaction: typeof FakeTransaction }).Transaction = FakeTransaction;
  setTestPool({} as sql.ConnectionPool);
  return () => {
    (sql as unknown as { Transaction: typeof Original }).Transaction = Original;
    setTestPool(null);
  };
}

describe("twoFactorService.startSetup", () => {
  afterEach(() => {
    mock.reset();
  });

  it("stores a pending encrypted secret without enabling 2FA", async () => {
    const restore = installFakeSqlTransaction();
    try {
      mock.method(userRepository, "findById", async () => ({ ...user }));
      mock.method(userRepository, "lockByIdForUpdate", async () => ({ ...user }));
      let saved: string | null = null;
      mock.method(userRepository, "savePendingTwoFactorSecret", async (_id: string, encrypted: string) => {
        saved = encrypted;
        return true;
      });

      const result = await twoFactorService.startSetup(user.id);
      assert.match(result.otpauthUri, /^otpauth:\/\/totp\//);
      assert.ok(result.secret.length > 10);
      assert.ok(saved);
      assert.equal(saved.includes(result.secret), false);
      assert.equal(saved.includes("otpauth:"), false);
    } finally {
      restore();
    }
  });

  it("rejects setup when 2FA is already enabled", async () => {
    mock.method(userRepository, "findById", async () => ({ ...user, twoFactorEnabled: true }));
    await assert.rejects(
      () => twoFactorService.startSetup(user.id),
      (error: unknown) => error instanceof AppError && error.code === "TWO_FACTOR_ALREADY_ENABLED",
    );
  });
});

describe("twoFactorService.confirmSetup", () => {
  afterEach(() => {
    mock.reset();
  });

  it("rejects an invalid password without enabling 2FA", async () => {
    const restore = installFakeSqlTransaction();
    try {
      const pending: User = {
        ...user,
        passwordHash: await hashPassword("correct-password-1"),
        twoFactorSecretEncrypted: encryptProtectedSecret("JBSWY3DPEHPK3PXP"),
      };
      mock.method(userRepository, "lockByIdForUpdate", async () => pending);
      mock.method(userRepository, "enableTwoFactor", async () => {
        throw new Error("must not enable");
      });
      await assert.rejects(
        () =>
          twoFactorService.confirmSetup(user.id, {
            password: "wrong-password-1",
            code: "123456",
          }),
        (error: unknown) => error instanceof AppError && error.code === "INVALID_CREDENTIALS",
      );
    } finally {
      restore();
    }
  });

  it("rejects an invalid TOTP with a valid password", async () => {
    const restore = installFakeSqlTransaction();
    try {
      const pending: User = {
        ...user,
        passwordHash: await hashPassword("correct-password-1"),
        twoFactorSecretEncrypted: encryptProtectedSecret("JBSWY3DPEHPK3PXP"),
      };
      mock.method(userRepository, "lockByIdForUpdate", async () => pending);
      mock.method(userRepository, "enableTwoFactor", async () => {
        throw new Error("must not enable");
      });
      await assert.rejects(
        () =>
          twoFactorService.confirmSetup(user.id, {
            password: "correct-password-1",
            code: "000000",
          }),
        (error: unknown) => error instanceof AppError && error.code === "INVALID_TWO_FACTOR_CODE",
      );
    } finally {
      restore();
    }
  });

  it("requires password and TOTP together to enable 2FA", async () => {
    const restore = installFakeSqlTransaction();
    try {
      const secret = "JBSWY3DPEHPK3PXP";
      const t0 = Date.UTC(2026, 7, 19, 12, 0, 0);
      const pending: User = {
        ...user,
        passwordHash: await hashPassword("correct-password-1"),
        twoFactorSecretEncrypted: encryptProtectedSecret(secret),
      };
      mock.method(userRepository, "lockByIdForUpdate", async () => pending);
      let enabledStep: number | null = null;
      mock.method(userRepository, "enableTwoFactor", async (_id: string, usedStep: number) => {
        enabledStep = usedStep;
        return 1;
      });
      mock.method(twoFactorRecoveryCodeRepository, "replaceAllForUser", async () => undefined);

      const result = await twoFactorService.confirmSetup(
        user.id,
        {
          password: "correct-password-1",
          code: generateTotpCode(secret, pending.email, t0),
        },
        t0,
      );
      assert.equal(result.recoveryCodes.length, 10);
      assert.ok(enabledStep !== null);
    } finally {
      restore();
    }
  });
});

describe("issueLoginChallenge", () => {
  afterEach(() => {
    mock.reset();
  });

  it("is rejected by jwt.verify with JWT_SECRET", async () => {
    mock.method(twoFactorChallengeRepository, "insert", async () => ({
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    }));
    const token = await issueLoginChallenge(user);
    assert.throws(() => jwt.verify(token, env.JWT_SECRET));
    const payload = jwt.verify(token, env.TWO_FACTOR_CHALLENGE_SECRET) as { purpose?: string };
    assert.equal(payload.purpose, "2fa_login");
  });
});
