/**
 * SQL Server integration for TOTP 2FA, recovery-code CAS, and challenge single-use.
 * Enable: RUN_DB_INTEGRATION_TESTS=true npm run test:integration
 */
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { after, before, it } from "node:test";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { env } from "../config/env";
import { AppError } from "../errors/app-error";
import { hashPassword, normalizeEmail } from "../utils/password";
import { generateTotpCode } from "../utils/totp";
import { hashRecoveryCode } from "../utils/recovery-code";
import { decryptProtectedSecret } from "../utils/protected-secret";

describeDatabaseIntegration("two-factor TOTP SQL", () => {
  before(async () => {
    await setupDatabaseIntegration();
  });

  after(async () => {
    await teardownDatabaseIntegration();
  });

  it("enrolls 2FA, challenges login, consumes recovery once, and keeps 2FA after password reset", async () => {
    const { getPool } = await import("../database/connection");
    const { userRepository } = await import("../repositories/user.repository");
    const { twoFactorService } = await import("../services/two-factor.service");
    const { authService } = await import("../services/auth.service");
    const { passwordResetService, passwordResetMailer } = await import(
      "../services/password-reset.service"
    );
    const { passwordResetTokenRepository } = await import(
      "../repositories/password-reset-token.repository"
    );
    const { twoFactorRecoveryCodeRepository } = await import(
      "../repositories/two-factor-recovery-code.repository"
    );
    const { mock } = await import("node:test");

    const email = normalizeEmail(
      `twofactor.${Date.now()}.${Math.random().toString(16).slice(2)}@example.com`,
    );
    const password = "original-password-1";
    const user = await userRepository.create({
      name: "Two Factor User",
      email,
      passwordHash: await hashPassword(password),
      role: "ADMIN",
    });

    const setup = await twoFactorService.startSetup(user.id);
    const reloadedPending = await userRepository.findById(user.id);
    assert.equal(reloadedPending?.twoFactorEnabled, false);
    assert.equal(reloadedPending?.twoFactorSecretEncrypted, null);
    assert.ok(reloadedPending?.twoFactorPendingSecretEncrypted);
    assert.doesNotMatch(reloadedPending.twoFactorPendingSecretEncrypted, /otpauth:/);
    assert.equal(decryptProtectedSecret(reloadedPending.twoFactorPendingSecretEncrypted), setup.secret);

    await assert.rejects(
      () =>
        twoFactorService.confirmSetup(
          user.id,
          {
            password,
            code: generateTotpCode(setup.secret, email, Date.now() + 11 * 60_000),
          },
          Date.now() + 11 * 60_000,
        ),
      (error: unknown) => error instanceof AppError && error.code === "TWO_FACTOR_SETUP_EXPIRED",
    );
    assert.equal((await userRepository.findById(user.id))?.twoFactorEnabled, false);

    await assert.rejects(
      () =>
        twoFactorService.confirmSetup(user.id, {
          password,
          code: "000000",
        }),
      (error: unknown) => error instanceof AppError && error.code === "INVALID_TWO_FACTOR_CODE",
    );
    assert.equal((await userRepository.findById(user.id))?.twoFactorEnabled, false);

    await assert.rejects(
      () =>
        twoFactorService.confirmSetup(user.id, {
          password: "not-the-password-1",
          code: generateTotpCode(setup.secret, email),
        }),
      (error: unknown) => error instanceof AppError && error.code === "INVALID_CREDENTIALS",
    );
    assert.equal((await userRepository.findById(user.id))?.twoFactorEnabled, false);

    const t0 = Date.now();
    const confirmCode = generateTotpCode(setup.secret, email, t0);
    const confirmed = await twoFactorService.confirmSetup(
      user.id,
      { password, code: confirmCode },
      t0,
    );
    assert.equal(confirmed.recoveryCodes.length, 10);
    const enabledUser = await userRepository.findById(user.id);
    assert.equal(enabledUser?.twoFactorEnabled, true);
    assert.equal(enabledUser?.tokenVersion, 1);

    await assert.rejects(
      () => twoFactorService.startSetup(user.id),
      (error: unknown) => error instanceof AppError && error.code === "TWO_FACTOR_ALREADY_ENABLED",
    );

    const firstLogin = await authService.login(email, password);
    assert.equal(firstLogin.requiresTwoFactor, true);
    if (firstLogin.requiresTwoFactor === false) {
      throw new Error("expected challenge");
    }
    assert.equal("token" in firstLogin, false);
    const stillPendingLogin = await userRepository.findById(user.id);
    assert.equal(stillPendingLogin?.lastLoginAt, null);

    assert.throws(() => jwt.verify(firstLogin.challengeToken, env.JWT_SECRET));

    await assert.rejects(
      () =>
        twoFactorService.completeLogin(
          {
            challengeToken: firstLogin.challengeToken,
            code: confirmCode,
          },
          t0,
        ),
      (error: unknown) => error instanceof AppError && error.code === "INVALID_TWO_FACTOR_CODE",
    );

    const t1 = t0 + 30_000;
    const totp = generateTotpCode(setup.secret, email, t1);
    const session = await twoFactorService.completeLogin(
      {
        challengeToken: firstLogin.challengeToken,
        code: totp,
      },
      t1,
    );
    assert.ok(session.token);
    const sessionUser = await userRepository.findById(user.id);
    assert.ok(sessionUser?.lastLoginAt);

    await assert.rejects(
      () =>
        twoFactorService.completeLogin({
          challengeToken: firstLogin.challengeToken,
          code: generateTotpCode(setup.secret, email),
        }),
      (error: unknown) =>
        error instanceof AppError &&
        (error.code === "INVALID_TWO_FACTOR_CHALLENGE" || error.code === "INVALID_TWO_FACTOR_CODE"),
    );

    const capturedTokens: string[] = [];
    mock.method(passwordResetMailer, "send", async (input: { text: string }) => {
      const match = /reset-password\?token=([^\s]+)/.exec(input.text);
      if (match?.[1]) {
        capturedTokens.push(decodeURIComponent(match[1]));
      }
      return { sent: true, messageId: "test", transport: "smtp" as const, publicErrorCode: null };
    });

    await passwordResetService.forgotPassword(email);
    assert.ok(capturedTokens[0]);
    await passwordResetService.resetPassword(capturedTokens[0], "rotated-password-1");
    const afterReset = await userRepository.findById(user.id);
    assert.equal(afterReset?.twoFactorEnabled, true);
    assert.ok(afterReset?.twoFactorSecretEncrypted);
    assert.equal(afterReset?.tokenVersion, 2);

    const afterResetLogin = await authService.login(email, "rotated-password-1");
    assert.equal(afterResetLogin.requiresTwoFactor, true);

    const recoveryLoginA = await authService.login(email, "rotated-password-1");
    const recoveryLoginB = await authService.login(email, "rotated-password-1");
    if (recoveryLoginA.requiresTwoFactor === false || recoveryLoginB.requiresTwoFactor === false) {
      throw new Error("expected challenge");
    }
    const recoveryCode = confirmed.recoveryCodes[0];
    const pool = getPool();
    const hash = hashRecoveryCode(recoveryCode);
    const stored = await pool
      .request()
      .input("hash", hash)
      .query(`SELECT code_hash FROM user_two_factor_recovery_codes WHERE code_hash = @hash`);
    assert.equal(stored.recordset.length, 1);
    assert.notEqual(JSON.stringify(stored.recordset[0]), recoveryCode);

    const winner = twoFactorService.completeLogin({
      challengeToken: recoveryLoginA.challengeToken,
      recoveryCode,
    });
    const loser = twoFactorService.completeLogin({
      challengeToken: recoveryLoginB.challengeToken,
      recoveryCode,
    });
    const results = await Promise.allSettled([winner, loser]);
    const fulfilled = results.filter((item) => item.status === "fulfilled");
    const rejected = results.filter((item) => item.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);

    const remaining = await twoFactorRecoveryCodeRepository.countUnconsumed(user.id);
    assert.equal(remaining, 9);

    const latest = await userRepository.findById(user.id);
    await twoFactorService.disable(user.id, {
      password: "rotated-password-1",
      recoveryCode: confirmed.recoveryCodes[1],
    });
    const disabled = await userRepository.findById(user.id);
    assert.equal(disabled?.twoFactorEnabled, false);
    assert.equal(disabled?.twoFactorSecretEncrypted, null);
    assert.ok((disabled?.tokenVersion ?? 0) > (latest?.tokenVersion ?? 0));
    assert.equal(await twoFactorRecoveryCodeRepository.countUnconsumed(user.id), 0);

    mock.reset();
    void passwordResetTokenRepository;
  });

  it("rejects a reused TOTP step and an inactive user completing a challenge", async () => {
    const { getPool } = await import("../database/connection");
    const { userRepository } = await import("../repositories/user.repository");
    const { twoFactorService } = await import("../services/two-factor.service");
    const { authService } = await import("../services/auth.service");

    const email = normalizeEmail(
      `twofactor.inactive.${Date.now()}.${Math.random().toString(16).slice(2)}@example.com`,
    );
    const password = "original-password-1";
    const user = await userRepository.create({
      name: "Inactive 2FA",
      email,
      passwordHash: await hashPassword(password),
      role: "ADMIN",
    });
    const setup = await twoFactorService.startSetup(user.id);
    const t0 = Date.now();
    await twoFactorService.confirmSetup(
      user.id,
      { password, code: generateTotpCode(setup.secret, email, t0) },
      t0,
    );

    const login = await authService.login(email, password);
    if (login.requiresTwoFactor === false) {
      throw new Error("expected challenge");
    }
    const t1 = t0 + 30_000;
    const code = generateTotpCode(setup.secret, email, t1);
    const first = twoFactorService.completeLogin(
      { challengeToken: login.challengeToken, code },
      t1,
    );
    const second = twoFactorService.completeLogin(
      { challengeToken: login.challengeToken, code },
      t1,
    );
    const raced = await Promise.allSettled([first, second]);
    assert.equal(raced.filter((item) => item.status === "fulfilled").length, 1);
    assert.equal(raced.filter((item) => item.status === "rejected").length, 1);

    const other = await userRepository.create({
      name: "To Deactivate",
      email: normalizeEmail(
        `twofactor.dead.${Date.now()}.${Math.random().toString(16).slice(2)}@example.com`,
      ),
      passwordHash: await hashPassword(password),
      role: "ADMIN",
    });
    const otherSetup = await twoFactorService.startSetup(other.id);
    const otherT0 = Date.now();
    await twoFactorService.confirmSetup(
      other.id,
      { password, code: generateTotpCode(otherSetup.secret, other.email, otherT0) },
      otherT0,
    );
    const pending = await authService.login(other.email, password);
    if (pending.requiresTwoFactor === false) {
      throw new Error("expected challenge");
    }
    await getPool()
      .request()
      .input("id", other.id)
      .query(`UPDATE users SET active = 0, updated_at = SYSUTCDATETIME() WHERE id = @id`);
    const otherT1 = otherT0 + 30_000;
    await assert.rejects(
      () =>
        twoFactorService.completeLogin(
          {
            challengeToken: pending.challengeToken,
            code: generateTotpCode(otherSetup.secret, other.email, otherT1),
          },
          otherT1,
        ),
      (error: unknown) => error instanceof AppError,
    );
  });

  it("serializes concurrent setup onto one persisted pending secret", async () => {
    const { userRepository } = await import("../repositories/user.repository");
    const { twoFactorService } = await import("../services/two-factor.service");
    const { decryptProtectedSecret } = await import("../utils/protected-secret");

    const email = normalizeEmail(
      `twofactor.setup.${Date.now()}.${Math.random().toString(16).slice(2)}@example.com`,
    );
    const user = await userRepository.create({
      name: "Concurrent Setup",
      email,
      passwordHash: await hashPassword("original-password-1"),
      role: "ADMIN",
    });

    const raced = await Promise.allSettled([
      twoFactorService.startSetup(user.id),
      twoFactorService.startSetup(user.id),
    ]);
    const secrets = raced
      .filter((item): item is PromiseFulfilledResult<{ secret: string }> => item.status === "fulfilled")
      .map((item) => item.value.secret);
    assert.equal(secrets.length, 2);
    const stored = await userRepository.findById(user.id);
    assert.equal(stored?.twoFactorEnabled, false);
    assert.equal(stored?.twoFactorSecretEncrypted, null);
    assert.ok(stored?.twoFactorPendingSecretEncrypted);
    const persisted = decryptProtectedSecret(stored.twoFactorPendingSecretEncrypted);
    assert.equal(secrets.includes(persisted), true);
  });

  it("rejects reusing a TOTP step for disable or recovery regenerate", async () => {
    const { userRepository } = await import("../repositories/user.repository");
    const { twoFactorService } = await import("../services/two-factor.service");
    const { authService } = await import("../services/auth.service");

    const email = normalizeEmail(
      `twofactor.replay.${Date.now()}.${Math.random().toString(16).slice(2)}@example.com`,
    );
    const password = "original-password-1";
    const user = await userRepository.create({
      name: "Replay 2FA",
      email,
      passwordHash: await hashPassword(password),
      role: "ADMIN",
    });
    const setup = await twoFactorService.startSetup(user.id);
    const t0 = Date.now();
    await twoFactorService.confirmSetup(
      user.id,
      { password, code: generateTotpCode(setup.secret, email, t0) },
      t0,
    );

    const login = await authService.login(email, password);
    if (login.requiresTwoFactor === false) {
      throw new Error("expected challenge");
    }
    const t1 = t0 + 30_000;
    const loginCode = generateTotpCode(setup.secret, email, t1);
    await twoFactorService.completeLogin(
      { challengeToken: login.challengeToken, code: loginCode },
      t1,
    );

    await assert.rejects(
      () =>
        twoFactorService.disable(user.id, { password, code: loginCode }, t1),
      (error: unknown) => error instanceof AppError && error.code === "INVALID_TWO_FACTOR_CODE",
    );
    assert.equal((await userRepository.findById(user.id))?.twoFactorEnabled, true);

    await assert.rejects(
      () =>
        twoFactorService.regenerateRecoveryCodes(user.id, { password, code: loginCode }, t1),
      (error: unknown) => error instanceof AppError && error.code === "INVALID_TWO_FACTOR_CODE",
    );

    const t2 = t1 + 30_000;
    const nextCode = generateTotpCode(setup.secret, email, t2);
    const regenerated = await twoFactorService.regenerateRecoveryCodes(
      user.id,
      { password, code: nextCode },
      t2,
    );
    assert.equal(regenerated.recoveryCodes.length, 10);
  });

  it("reconfigures to authenticator B only after confirm, and cancels without replacing A", async () => {
    const { getPool } = await import("../database/connection");
    const { userRepository } = await import("../repositories/user.repository");
    const { twoFactorService } = await import("../services/two-factor.service");
    const { authService } = await import("../services/auth.service");
    const { twoFactorRecoveryCodeRepository } = await import(
      "../repositories/two-factor-recovery-code.repository"
    );
    const { issueLoginChallenge } = await import("../services/two-factor.service");

    const email = normalizeEmail(
      `twofactor.reconfig.${Date.now()}.${Math.random().toString(16).slice(2)}@example.com`,
    );
    const password = "original-password-1";
    const user = await userRepository.create({
      name: "Reconfigure 2FA",
      email,
      passwordHash: await hashPassword(password),
      role: "ADMIN",
    });
    const setupA = await twoFactorService.startSetup(user.id);
    const t0 = Date.now();
    const enrolled = await twoFactorService.confirmSetup(
      user.id,
      { password, code: generateTotpCode(setupA.secret, email, t0) },
      t0,
    );
    const tokenAfterEnroll = (await userRepository.findById(user.id))?.tokenVersion ?? 0;

    await assert.rejects(
      () =>
        twoFactorService.confirmSetup(
          user.id,
          { password, code: generateTotpCode(setupA.secret, email, t0 + 11 * 60_000) },
          t0 + 11 * 60_000,
        ),
      (error: unknown) => error instanceof AppError && error.code === "TWO_FACTOR_ALREADY_ENABLED",
    );

    const t1 = t0 + 30_000;
    const started = await twoFactorService.startReconfigure(
      user.id,
      { password, code: generateTotpCode(setupA.secret, email, t1) },
      t1,
    );
    const pending = await userRepository.findById(user.id);
    assert.equal(pending?.twoFactorEnabled, true);
    assert.equal(decryptProtectedSecret(pending?.twoFactorSecretEncrypted ?? ""), setupA.secret);
    assert.equal(decryptProtectedSecret(pending?.twoFactorPendingSecretEncrypted ?? ""), started.secret);
    const status = await twoFactorService.getStatus(user.id);
    assert.equal(status.reconfigurationPending, true);

    const stillA = await authService.login(email, password);
    if (stillA.requiresTwoFactor === false) {
      throw new Error("expected challenge");
    }
    const tLoginA = t1 + 30_000;
    await twoFactorService.completeLogin(
      {
        challengeToken: stillA.challengeToken,
        code: generateTotpCode(setupA.secret, email, tLoginA),
      },
      tLoginA,
    );

    await twoFactorService.cancelReconfigure(user.id);
    const afterCancel = await userRepository.findById(user.id);
    assert.equal(afterCancel?.twoFactorPendingSecretEncrypted, null);
    assert.equal(decryptProtectedSecret(afterCancel?.twoFactorSecretEncrypted ?? ""), setupA.secret);
    assert.equal((await twoFactorService.getStatus(user.id)).reconfigurationPending, false);

    const remainingBefore = await twoFactorRecoveryCodeRepository.countUnconsumed(user.id);
    const t2 = tLoginA + 30_000;
    await twoFactorService.startReconfigure(
      user.id,
      { password, recoveryCode: enrolled.recoveryCodes[0] },
      t2,
    );
    assert.equal(await twoFactorRecoveryCodeRepository.countUnconsumed(user.id), remainingBefore - 1);

    await assert.rejects(
      () => twoFactorService.confirmReconfigure(user.id, { code: "123456" }, t2 + 11 * 60_000),
      (error: unknown) => error instanceof AppError && error.code === "TWO_FACTOR_SETUP_EXPIRED",
    );
    assert.equal(
      decryptProtectedSecret((await userRepository.findById(user.id))?.twoFactorSecretEncrypted ?? ""),
      setupA.secret,
    );

    const t3 = t2 + 30_000;
    const startedFresh = await twoFactorService.startReconfigure(
      user.id,
      { password, code: generateTotpCode(setupA.secret, email, t3) },
      t3,
    );
    const t4 = t3 + 30_000;
    const confirmed = await twoFactorService.confirmReconfigure(
      user.id,
      { code: generateTotpCode(startedFresh.secret, email, t4) },
      t4,
    );
    assert.equal(confirmed.recoveryCodes.length, 10);
    const promoted = await userRepository.findById(user.id);
    assert.equal(decryptProtectedSecret(promoted?.twoFactorSecretEncrypted ?? ""), startedFresh.secret);
    assert.equal(promoted?.twoFactorPendingSecretEncrypted, null);
    assert.ok((promoted?.tokenVersion ?? 0) > tokenAfterEnroll);

    const loginB = await authService.login(email, password);
    if (loginB.requiresTwoFactor === false) {
      throw new Error("expected challenge");
    }
    const t5 = t4 + 30_000;
    await assert.rejects(
      () =>
        twoFactorService.completeLogin(
          {
            challengeToken: loginB.challengeToken,
            code: generateTotpCode(setupA.secret, email, t5),
          },
          t5,
        ),
      (error: unknown) => error instanceof AppError && error.code === "INVALID_TWO_FACTOR_CODE",
    );
    const loginB2 = await authService.login(email, password);
    if (loginB2.requiresTwoFactor === false) {
      throw new Error("expected challenge");
    }
    const session = await twoFactorService.completeLogin(
      {
        challengeToken: loginB2.challengeToken,
        code: generateTotpCode(startedFresh.secret, email, t5 + 30_000),
      },
      t5 + 30_000,
    );
    assert.ok(session.token);

    const pool = getPool();
    await pool.request().input("userId", user.id).query(`
      INSERT INTO user_two_factor_login_challenges (user_id, token_hash, expires_at)
      VALUES (@userId, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', DATEADD(MINUTE, -1, SYSUTCDATETIME()))
    `);
    await issueLoginChallenge(promoted!);
    const leftover = await pool.request().input("userId", user.id).query(`
      SELECT COUNT(*) AS n
      FROM user_two_factor_login_challenges
      WHERE user_id = @userId
        AND token_hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    `);
    assert.equal(Number(leftover.recordset[0].n), 0);
  });

  it("allows only one concurrent reconfigure setup to consume the same TOTP", async () => {
    const { userRepository } = await import("../repositories/user.repository");
    const { twoFactorService } = await import("../services/two-factor.service");

    const email = normalizeEmail(
      `twofactor.reconfig.race.${Date.now()}.${Math.random().toString(16).slice(2)}@example.com`,
    );
    const password = "original-password-1";
    const user = await userRepository.create({
      name: "Reconfigure Race",
      email,
      passwordHash: await hashPassword(password),
      role: "ADMIN",
    });
    const setup = await twoFactorService.startSetup(user.id);
    const t0 = Date.now();
    await twoFactorService.confirmSetup(
      user.id,
      { password, code: generateTotpCode(setup.secret, email, t0) },
      t0,
    );
    const t1 = t0 + 30_000;
    const code = generateTotpCode(setup.secret, email, t1);
    const raced = await Promise.allSettled([
      twoFactorService.startReconfigure(user.id, { password, code }, t1),
      twoFactorService.startReconfigure(user.id, { password, code }, t1),
    ]);
    assert.equal(raced.filter((item) => item.status === "fulfilled").length, 1);
    assert.equal(raced.filter((item) => item.status === "rejected").length, 1);
  });
});
