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
        twoFactorPendingSecretEncrypted: encryptProtectedSecret(secret),
        twoFactorPendingCreatedAt: new Date(t0).toISOString(),
      };
      mock.method(userRepository, "lockByIdForUpdate", async () => pending);
      let enabledStep: number | null = null;
      mock.method(userRepository, "enableTwoFactorFromPending", async (_id: string, usedStep: number) => {
        enabledStep = usedStep;
        return 1;
      });
      mock.method(userRepository, "enableTwoFactor", async () => {
        throw new Error("legacy enable must not run when pending exists");
      });
      mock.method(twoFactorRecoveryCodeRepository, "replaceAllForUser", async () => undefined);
      mock.method(twoFactorChallengeRepository, "deleteAllForUser", async () => undefined);

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

  it("rejects an expired pending enrollment", async () => {
    const restore = installFakeSqlTransaction();
    try {
      const t0 = Date.UTC(2026, 7, 19, 12, 0, 0);
      const pending: User = {
        ...user,
        passwordHash: await hashPassword("correct-password-1"),
        twoFactorPendingSecretEncrypted: encryptProtectedSecret("JBSWY3DPEHPK3PXP"),
        twoFactorPendingCreatedAt: new Date(t0).toISOString(),
      };
      mock.method(userRepository, "lockByIdForUpdate", async () => pending);
      mock.method(userRepository, "enableTwoFactorFromPending", async () => {
        throw new Error("must not enable");
      });
      await assert.rejects(
        () =>
          twoFactorService.confirmSetup(
            user.id,
            {
              password: "correct-password-1",
              code: generateTotpCode("JBSWY3DPEHPK3PXP", pending.email, t0 + 11 * 60_000),
            },
            t0 + 11 * 60_000,
          ),
        (error: unknown) => error instanceof AppError && error.code === "TWO_FACTOR_SETUP_EXPIRED",
      );
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
    mock.method(twoFactorChallengeRepository, "deleteStaleForUser", async () => 0);
    const token = await issueLoginChallenge(user);
    assert.throws(() => jwt.verify(token, env.JWT_SECRET));
    const payload = jwt.verify(token, env.TWO_FACTOR_CHALLENGE_SECRET) as { purpose?: string };
    assert.equal(payload.purpose, "2fa_login");
  });
});

describe("twoFactorService.startReconfigure", () => {
  afterEach(() => {
    mock.reset();
  });

  it("rejects JWT-authenticated reconfigure without a valid password", async () => {
    const restore = installFakeSqlTransaction();
    try {
      mock.method(userRepository, "lockByIdForUpdate", async () => ({
        ...user,
        twoFactorEnabled: true,
        twoFactorSecretEncrypted: encryptProtectedSecret("JBSWY3DPEHPK3PXP"),
        passwordHash: await hashPassword("correct-password-1"),
      }));
      mock.method(userRepository, "saveReconfigurationPendingSecret", async () => {
        throw new Error("must not persist pending");
      });
      await assert.rejects(
        () =>
          twoFactorService.startReconfigure(user.id, {
            password: "wrong-password-1",
            code: "123456",
          }),
        (error: unknown) => error instanceof AppError && error.code === "INVALID_CREDENTIALS",
      );
    } finally {
      restore();
    }
  });

  it("stores a pending secret without replacing the active authenticator", async () => {
    const restore = installFakeSqlTransaction();
    try {
      const secret = "JBSWY3DPEHPK3PXP";
      const t0 = Date.UTC(2026, 7, 19, 12, 0, 0);
      mock.method(userRepository, "lockByIdForUpdate", async () => ({
        ...user,
        twoFactorEnabled: true,
        twoFactorSecretEncrypted: encryptProtectedSecret(secret),
        passwordHash: await hashPassword("correct-password-1"),
      }));
      mock.method(userRepository, "markTotpStepUsed", async () => true);
      mock.method(userRepository, "promotePendingTwoFactorSecret", async () => {
        throw new Error("must not promote until confirm");
      });
      let saved: string | null = null;
      mock.method(
        userRepository,
        "saveReconfigurationPendingSecret",
        async (_id: string, encrypted: string) => {
          saved = encrypted;
          return true;
        },
      );

      const result = await twoFactorService.startReconfigure(
        user.id,
        {
          password: "correct-password-1",
          code: generateTotpCode(secret, user.email, t0),
        },
        t0,
      );
      assert.match(result.otpauthUri, /^otpauth:\/\/totp\//);
      assert.ok(saved);
      assert.equal(saved.includes(result.secret), false);
      assert.notEqual(result.secret, secret);
    } finally {
      restore();
    }
  });

  it("consumes a recovery code during reconfigure step-up", async () => {
    const restore = installFakeSqlTransaction();
    try {
      mock.method(userRepository, "lockByIdForUpdate", async () => ({
        ...user,
        twoFactorEnabled: true,
        twoFactorSecretEncrypted: encryptProtectedSecret("JBSWY3DPEHPK3PXP"),
        passwordHash: await hashPassword("correct-password-1"),
      }));
      mock.method(userRepository, "markTotpStepUsed", async () => {
        throw new Error("must not consume TOTP");
      });
      let consumed = false;
      mock.method(twoFactorRecoveryCodeRepository, "consumeValidByHash", async () => {
        consumed = true;
        return true;
      });
      mock.method(userRepository, "saveReconfigurationPendingSecret", async () => true);

      await twoFactorService.startReconfigure(user.id, {
        password: "correct-password-1",
        recoveryCode: "AAAA-BBBB-CCCC-DDDD-EEEE",
      });
      assert.equal(consumed, true);
    } finally {
      restore();
    }
  });
});

describe("twoFactorService.confirmReconfigure", () => {
  afterEach(() => {
    mock.reset();
  });

  it("promotes the pending secret, rotates recovery codes, and bumps token_version", async () => {
    const restore = installFakeSqlTransaction();
    try {
      const pendingSecret = "KBSWY3DPEHPK3PXP";
      const t0 = Date.UTC(2026, 7, 19, 12, 0, 0);
      mock.method(userRepository, "lockByIdForUpdate", async () => ({
        ...user,
        twoFactorEnabled: true,
        tokenVersion: 1,
        twoFactorSecretEncrypted: encryptProtectedSecret("JBSWY3DPEHPK3PXP"),
        twoFactorPendingSecretEncrypted: encryptProtectedSecret(pendingSecret),
        twoFactorPendingCreatedAt: new Date(t0).toISOString(),
      }));
      let promoted = false;
      mock.method(userRepository, "promotePendingTwoFactorSecret", async (_id: string, usedStep: number) => {
        promoted = true;
        assert.ok(usedStep > 0);
        return 2;
      });
      mock.method(twoFactorRecoveryCodeRepository, "replaceAllForUser", async () => undefined);
      mock.method(twoFactorChallengeRepository, "deleteAllForUser", async () => undefined);

      const result = await twoFactorService.confirmReconfigure(
        user.id,
        { code: generateTotpCode(pendingSecret, user.email, t0) },
        t0,
      );
      assert.equal(promoted, true);
      assert.equal(result.recoveryCodes.length, 10);
    } finally {
      restore();
    }
  });

  it("rejects an expired pending reconfiguration without promoting", async () => {
    const restore = installFakeSqlTransaction();
    try {
      const t0 = Date.UTC(2026, 7, 19, 12, 0, 0);
      mock.method(userRepository, "lockByIdForUpdate", async () => ({
        ...user,
        twoFactorEnabled: true,
        twoFactorSecretEncrypted: encryptProtectedSecret("JBSWY3DPEHPK3PXP"),
        twoFactorPendingSecretEncrypted: encryptProtectedSecret("KBSWY3DPEHPK3PXP"),
        twoFactorPendingCreatedAt: new Date(t0).toISOString(),
      }));
      mock.method(userRepository, "promotePendingTwoFactorSecret", async () => {
        throw new Error("must not promote");
      });
      await assert.rejects(
        () =>
          twoFactorService.confirmReconfigure(
            user.id,
            { code: "123456" },
            t0 + 11 * 60_000,
          ),
        (error: unknown) => error instanceof AppError && error.code === "TWO_FACTOR_SETUP_EXPIRED",
      );
    } finally {
      restore();
    }
  });
});

describe("twoFactorService.cancelReconfigure", () => {
  afterEach(() => {
    mock.reset();
  });

  it("clears the pending secret and keeps 2FA enabled", async () => {
    const restore = installFakeSqlTransaction();
    try {
      mock.method(userRepository, "lockByIdForUpdate", async () => ({
        ...user,
        twoFactorEnabled: true,
        twoFactorSecretEncrypted: encryptProtectedSecret("JBSWY3DPEHPK3PXP"),
        twoFactorPendingSecretEncrypted: encryptProtectedSecret("KBSWY3DPEHPK3PXP"),
        twoFactorPendingCreatedAt: new Date().toISOString(),
      }));
      let cleared = false;
      mock.method(userRepository, "clearPendingTwoFactorSecret", async () => {
        cleared = true;
        return true;
      });
      mock.method(userRepository, "disableTwoFactor", async () => {
        throw new Error("must not disable");
      });
      await twoFactorService.cancelReconfigure(user.id);
      assert.equal(cleared, true);
    } finally {
      restore();
    }
  });
});
