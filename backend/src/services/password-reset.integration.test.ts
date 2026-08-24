/**
 * SQL Server integration for password reset CAS, rotation, and JWT invalidation.
 * Enable: RUN_DB_INTEGRATION_TESTS=true npm run test:integration
 */
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { after, before, it, mock } from "node:test";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { env } from "../config/env";
import { AppError } from "../errors/app-error";
import { hashOpaqueToken } from "../utils/opaque-token";
import { hashPassword, normalizeEmail, verifyPassword } from "../utils/password";

describeDatabaseIntegration("password reset SQL concurrency", () => {
  before(async () => {
    await setupDatabaseIntegration();
  });

  after(async () => {
    await teardownDatabaseIntegration();
  });

  it("rotates tokens, consumes once under concurrency, and invalidates prior JWTs", async () => {
    const { getPool } = await import("../database/connection");
    const { userRepository } = await import("../repositories/user.repository");
    const { passwordResetTokenRepository } = await import(
      "../repositories/password-reset-token.repository"
    );
    const { passwordResetService, passwordResetMailer } = await import("../services/password-reset.service");
    const { authService } = await import("../services/auth.service");

    const email = normalizeEmail(
      `reset.concurrent.${Date.now()}.${Math.random().toString(16).slice(2)}@example.com`,
    );
    const originalPassword = "original-password-1";
    const user = await userRepository.create({
      name: "Reset Concurrent",
      email,
      passwordHash: await hashPassword(originalPassword),
      role: "ADMIN",
    });

    const capturedTokens: string[] = [];
    mock.method(passwordResetMailer, "send", async (input: { text: string }) => {
      const match = /reset-password\?token=([^\s]+)/.exec(input.text);
      if (match?.[1]) {
        capturedTokens.push(decodeURIComponent(match[1]));
      }
      return {
        sent: true,
        messageId: "test",
        transport: "smtp" as const,
        publicErrorCode: null,
      };
    });

    try {
      const loginBefore = await authService.login(email, originalPassword);
      assert.equal(loginBefore.requiresTwoFactor, false);
      if (loginBefore.requiresTwoFactor) {
        throw new Error("expected password-only login");
      }
      const payloadBefore = jwt.verify(loginBefore.token, env.JWT_SECRET) as {
        tokenVersion: number;
      };
      assert.equal(payloadBefore.tokenVersion, 0);

      await passwordResetService.forgotPassword(email);
      await passwordResetService.forgotPassword(email);
      assert.ok(capturedTokens.length >= 2);
      const tokenA = capturedTokens[0];
      const tokenB = capturedTokens[capturedTokens.length - 1];
      assert.notEqual(tokenA, tokenB);

      await assert.rejects(
        () => passwordResetService.resetPassword(tokenA, "rotated-password-1"),
        (error: unknown) => error instanceof AppError && error.code === "INVALID_PASSWORD_RESET_TOKEN",
      );

      const winnerPassword = "winner-password-1";
      const loserPassword = "loser-password-12";
      const [first, second] = await Promise.allSettled([
        passwordResetService.resetPassword(tokenB, winnerPassword),
        passwordResetService.resetPassword(tokenB, loserPassword),
      ]);

      const fulfilled = [first, second].filter((result) => result.status === "fulfilled");
      const rejected = [first, second].filter((result) => result.status === "rejected");
      assert.equal(fulfilled.length, 1);
      assert.equal(rejected.length, 1);

      const stored = await userRepository.findById(user.id);
      assert.ok(stored);
      assert.equal(stored.tokenVersion, 1);
      const winnerOk = await verifyPassword(winnerPassword, stored.passwordHash);
      const loserOk = await verifyPassword(loserPassword, stored.passwordHash);
      assert.equal(winnerOk || loserOk, true);
      assert.equal(winnerOk && loserOk, false);

      const hash = hashOpaqueToken(tokenB);
      const tokenRow = await passwordResetTokenRepository.findByHash(hash);
      assert.ok(tokenRow?.consumedAt);

      const userAfter = await userRepository.findById(user.id);
      assert.ok(userAfter);
      assert.equal(authService.verifyToken(loginBefore.token).tokenVersion, 0);
      const { isSessionValid } = await import("../services/auth.service");
      assert.equal(isSessionValid(userAfter, 0), false);

      await assert.rejects(
        () => passwordResetService.resetPassword(tokenB, "another-password-1"),
        (error: unknown) => error instanceof AppError && error.code === "INVALID_PASSWORD_RESET_TOKEN",
      );
    } finally {
      mock.reset();
      const pool = getPool();
      await pool.request().input("userId", user.id).query(`
        DELETE FROM user_password_reset_tokens WHERE user_id = @userId;
        DELETE FROM users WHERE id = @userId;
      `);
    }
  });

  it("invalidates an issued token when SMTP send throws", async () => {
    const { getPool } = await import("../database/connection");
    const { userRepository } = await import("../repositories/user.repository");
    const { passwordResetService, passwordResetMailer } = await import("../services/password-reset.service");
    const sql = (await import("mssql")).default;

    const email = normalizeEmail(
      `reset.smtp.${Date.now()}.${Math.random().toString(16).slice(2)}@example.com`,
    );
    const user = await userRepository.create({
      name: "Reset Smtp",
      email,
      passwordHash: await hashPassword("smtp-password-1"),
      role: "ADMIN",
    });

    mock.method(passwordResetMailer, "send", async () => {
      throw new Error("SMTP down");
    });

    try {
      await passwordResetService.forgotPassword(email);
      const pool = getPool();
      const rows = await pool.request().input("userId", sql.UniqueIdentifier, user.id).query(`
        SELECT consumed_at
        FROM user_password_reset_tokens
        WHERE user_id = @userId
      `);
      assert.ok(rows.recordset.length >= 1);
      assert.ok(rows.recordset.every((row) => row.consumed_at != null));
    } finally {
      mock.reset();
      const pool = getPool();
      await pool.request().input("userId", user.id).query(`
        DELETE FROM user_password_reset_tokens WHERE user_id = @userId;
        DELETE FROM users WHERE id = @userId;
      `);
    }
  });

  it("never persists plaintext reset tokens", async () => {
    const { getPool } = await import("../database/connection");
    const { userRepository } = await import("../repositories/user.repository");
    const { passwordResetService, passwordResetMailer } = await import("../services/password-reset.service");
    const sql = (await import("mssql")).default;

    const email = normalizeEmail(
      `reset.hash.${Date.now()}.${Math.random().toString(16).slice(2)}@example.com`,
    );
    const user = await userRepository.create({
      name: "Reset Hash",
      email,
      passwordHash: await hashPassword("hash-password-1"),
      role: "ADMIN",
    });

    let rawToken = "";
    mock.method(passwordResetMailer, "send", async (input: { text: string }) => {
      const match = /reset-password\?token=([^\s]+)/.exec(input.text);
      rawToken = decodeURIComponent(match?.[1] ?? "");
      return {
        sent: true,
        messageId: "test",
        transport: "smtp" as const,
        publicErrorCode: null,
      };
    });

    try {
      await passwordResetService.forgotPassword(email);
      assert.ok(rawToken.length >= 32);
      const pool = getPool();
      const rows = await pool.request().input("userId", sql.UniqueIdentifier, user.id).query(`
        SELECT token_hash, CAST(token_hash AS NVARCHAR(64)) AS hash_text
        FROM user_password_reset_tokens
        WHERE user_id = @userId AND consumed_at IS NULL
      `);
      assert.equal(rows.recordset.length, 1);
      const storedHash = String(rows.recordset[0].hash_text).trim();
      assert.notEqual(storedHash, rawToken);
      assert.equal(storedHash, hashOpaqueToken(rawToken));
      assert.equal(storedHash.length, 64);
    } finally {
      mock.reset();
      const pool = getPool();
      await pool.request().input("userId", user.id).query(`
        DELETE FROM user_password_reset_tokens WHERE user_id = @userId;
        DELETE FROM users WHERE id = @userId;
      `);
    }
  });

  it("rejects an expired unconsumed token", async () => {
    const { getPool } = await import("../database/connection");
    const { userRepository } = await import("../repositories/user.repository");
    const { passwordResetTokenRepository } = await import(
      "../repositories/password-reset-token.repository"
    );
    const { passwordResetService } = await import("../services/password-reset.service");
    const { generateOpaqueToken, hashOpaqueToken: hashToken } = await import("../utils/opaque-token");

    const email = normalizeEmail(
      `reset.expired.${Date.now()}.${Math.random().toString(16).slice(2)}@example.com`,
    );
    const user = await userRepository.create({
      name: "Reset Expired",
      email,
      passwordHash: await hashPassword("expired-password-1"),
      role: "ADMIN",
    });
    const rawToken = generateOpaqueToken();
    await passwordResetTokenRepository.insert({
      userId: user.id,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() - 60_000),
    });

    try {
      await assert.rejects(
        () => passwordResetService.resetPassword(rawToken, "fresh-password-1"),
        (error: unknown) => error instanceof AppError && error.code === "INVALID_PASSWORD_RESET_TOKEN",
      );
    } finally {
      const pool = getPool();
      await pool.request().input("userId", user.id).query(`
        DELETE FROM user_password_reset_tokens WHERE user_id = @userId;
        DELETE FROM users WHERE id = @userId;
      `);
    }
  });

  it("keeps a consistent DB when forgot-password races reset-password", async () => {
    const { getPool } = await import("../database/connection");
    const { userRepository } = await import("../repositories/user.repository");
    const { passwordResetTokenRepository } = await import(
      "../repositories/password-reset-token.repository"
    );
    const { passwordResetService, passwordResetMailer } = await import("../services/password-reset.service");
    const { generateOpaqueToken, hashOpaqueToken: hashToken } = await import("../utils/opaque-token");
    const sql = (await import("mssql")).default;

    const email = normalizeEmail(
      `reset.forgot.race.${Date.now()}.${Math.random().toString(16).slice(2)}@example.com`,
    );
    const originalPassword = "original-password-1";
    const resetPasswordValue = "reset-password-12";
    const user = await userRepository.create({
      name: "Forgot Vs Reset",
      email,
      passwordHash: await hashPassword(originalPassword),
      role: "ADMIN",
    });

    const tokenA = generateOpaqueToken();
    await passwordResetTokenRepository.insert({
      userId: user.id,
      tokenHash: hashToken(tokenA),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    mock.method(passwordResetMailer, "send", async () => ({
      sent: true,
      messageId: "test",
      transport: "smtp" as const,
      publicErrorCode: null,
    }));

    try {
      const [forgotResult, resetResult] = await Promise.allSettled([
        passwordResetService.forgotPassword(email),
        passwordResetService.resetPassword(tokenA, resetPasswordValue),
      ]);

      assert.equal(forgotResult.status, "fulfilled");
      if (forgotResult.status === "fulfilled") {
        assert.equal(
          forgotResult.value.message,
          "Si existe una cuenta asociada a ese email, recibirás instrucciones para restablecer tu contraseña.",
        );
      }

      if (resetResult.status === "rejected") {
        const error = resetResult.reason;
        assert.ok(error instanceof AppError);
        assert.ok(
          error.code === "INVALID_PASSWORD_RESET_TOKEN" || error.code === "PASSWORD_RESET_CONFLICT",
        );
      }

      const stored = await userRepository.findById(user.id);
      assert.ok(stored);
      const originalOk = await verifyPassword(originalPassword, stored.passwordHash);
      const resetOk = await verifyPassword(resetPasswordValue, stored.passwordHash);
      assert.equal(originalOk || resetOk, true);
      assert.equal(originalOk && resetOk, false);

      if (resetResult.status === "fulfilled") {
        assert.equal(stored.tokenVersion, 1);
        assert.equal(resetOk, true);
      } else {
        assert.ok(stored.tokenVersion === 0 || stored.tokenVersion === 1);
        if (stored.tokenVersion === 1) {
          assert.equal(resetOk, true);
        } else {
          assert.equal(originalOk, true);
        }
      }

      const pool = getPool();
      const tokens = await pool.request().input("userId", sql.UniqueIdentifier, user.id).query(`
        SELECT consumed_at
        FROM user_password_reset_tokens
        WHERE user_id = @userId
      `);
      const unconsumed = tokens.recordset.filter((row) => row.consumed_at == null);
      assert.ok(unconsumed.length <= 1);
      const tokenARow = await passwordResetTokenRepository.findByHash(hashToken(tokenA));
      if (resetResult.status === "fulfilled") {
        assert.ok(tokenARow?.consumedAt);
      }
    } finally {
      mock.reset();
      const pool = getPool();
      await pool.request().input("userId", user.id).query(`
        DELETE FROM user_password_reset_tokens WHERE user_id = @userId;
        DELETE FROM users WHERE id = @userId;
      `);
    }
  });
});
