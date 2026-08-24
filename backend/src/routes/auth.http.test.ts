import assert from "node:assert/strict";
import { after, afterEach, before, describe, it, mock } from "node:test";
import express from "express";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";

setupUnitTestEnv();

import { env } from "../config/env";
import { AppError } from "../errors/app-error";
import { errorHandler } from "../middleware/error-handler";
import { resetRateLimitBucketsForTests } from "../middleware/rate-limit";
import { authRouter } from "../routes/auth.routes";
import { userRepository } from "../repositories/user.repository";
import { twoFactorChallengeRepository } from "../repositories/two-factor-challenge.repository";
import { twoFactorService } from "../services/two-factor.service";
import { passwordResetIssuer, passwordResetMailer, passwordResetService } from "../services/password-reset.service";
import { passwordResetTokenRepository } from "../repositories/password-reset-token.repository";
import { apiRequest, signTestToken, startTestServer } from "../test-helpers/http-test";
import { hashPassword } from "../utils/password";
import type { User } from "../types/auth";
import { TWO_FACTOR_USER_DEFAULTS } from "../types/auth";
import jwt from "jsonwebtoken";

describe("auth HTTP login and password reset", () => {
  let baseUrl = "";
  let close: (() => Promise<void>) | null = null;

  before(async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/auth", authRouter);
    app.use(errorHandler);
    const started = await startTestServer(app);
    baseUrl = started.baseUrl;
    close = started.close;
  });

  after(async () => {
    if (close) {
      await close();
    }
  });

  afterEach(() => {
    mock.reset();
    resetRateLimitBucketsForTests();
  });

  it("rate-limits login with 429", async () => {
    mock.method(userRepository, "findByEmail", async () => null);
    const max = env.AUTH_LOGIN_RATE_LIMIT_MAX;
    let last = { status: 0, body: {} as Record<string, unknown> };
    for (let i = 0; i <= max; i += 1) {
      last = await apiRequest(baseUrl, "/api/auth/login", {
        method: "POST",
        body: { email: "rate@example.com", password: "not-the-password" },
      });
    }
    assert.equal(last.status, 429);
    assert.equal((last.body.error as { code?: string })?.code, "RATE_LIMITED");
  });

  it("returns the same forgot-password body for missing and inactive emails", async () => {
    mock.method(userRepository, "findByEmail", async () => null);

    const missing = await apiRequest(baseUrl, "/api/auth/forgot-password", {
      method: "POST",
      body: { email: "  Missing.User@example.com " },
    });

    const inactive: User = {
      id: "22222222-2222-4222-8222-222222222222",
      name: "Inactivo",
      email: "inactive@example.com",
      passwordHash: await hashPassword("password12"),
      role: "ADMIN",
      isPlatformAdmin: false,
      active: false,
      tokenVersion: 0,
      ...TWO_FACTOR_USER_DEFAULTS,
      lastLoginAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    mock.method(userRepository, "findByEmail", async () => inactive);

    const inactiveResponse = await apiRequest(baseUrl, "/api/auth/forgot-password", {
      method: "POST",
      body: { email: "inactive@example.com" },
    });

    assert.equal(missing.status, 200);
    assert.equal(inactiveResponse.status, 200);
    assert.deepEqual(missing.body, inactiveResponse.body);
  });

  it("does not auto-login after reset and rejects confirmation mismatch", async () => {
    const mismatch = await apiRequest(baseUrl, "/api/auth/reset-password", {
      method: "POST",
      body: {
        token: "a".repeat(43),
        password: "new-password-1",
        passwordConfirmation: "new-password-2",
      },
    });
    assert.equal(mismatch.status, 400);

    mock.method(passwordResetService, "resetPassword", async () => ({
      message: "Contraseña actualizada correctamente. Iniciá sesión nuevamente.",
    }));
    const ok = await apiRequest(baseUrl, "/api/auth/reset-password", {
      method: "POST",
      body: {
        token: "a".repeat(43),
        password: "new-password-1",
        passwordConfirmation: "new-password-1",
      },
    });
    assert.equal(ok.status, 200);
    assert.equal((ok.body as { data?: { token?: string } }).data?.token, undefined);
  });

  it("returns the same forgot-password HTTP body when SMTP compensation fails", async () => {
    mock.method(userRepository, "findByEmail", async () => null);
    const missing = await apiRequest(baseUrl, "/api/auth/forgot-password", {
      method: "POST",
      body: { email: "missing@example.com" },
    });

    const active: User = {
      id: "44444444-4444-4444-8444-444444444444",
      name: "Activo",
      email: "active@example.com",
      passwordHash: await hashPassword("password12"),
      role: "ADMIN",
      isPlatformAdmin: false,
      active: true,
      tokenVersion: 0,
      ...TWO_FACTOR_USER_DEFAULTS,
      lastLoginAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    mock.method(userRepository, "findByEmail", async () => active);
    mock.method(passwordResetIssuer, "issueForUser", async () => ({
      rawToken: "issued-raw-token",
      tokenId: "88888888-8888-4888-8888-888888888888",
      expiresAt: new Date(Date.now() + 60_000),
    }));
    mock.method(passwordResetMailer, "send", async () => {
      throw new Error("SMTP down");
    });
    mock.method(passwordResetTokenRepository, "consumeById", async () => {
      throw new Error("DB compensation failed");
    });

    const failed = await apiRequest(baseUrl, "/api/auth/forgot-password", {
      method: "POST",
      body: { email: "active@example.com" },
    });

    assert.equal(missing.status, 200);
    assert.equal(failed.status, 200);
    assert.deepEqual(missing.body, failed.body);
  });

  it("rejects passwords outside policy on reset", async () => {
    const short = await apiRequest(baseUrl, "/api/auth/reset-password", {
      method: "POST",
      body: {
        token: "a".repeat(43),
        password: "short",
        passwordConfirmation: "short",
      },
    });
    assert.equal(short.status, 400);
  });

  it("does not return a session JWT when 2FA is enabled and rejects the challenge as Bearer", async () => {
    const twoFactorUser: User = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "2FA",
      email: "twofactor@example.com",
      passwordHash: await hashPassword("password12"),
      role: "ADMIN",
      isPlatformAdmin: false,
      active: true,
      tokenVersion: 1,
      ...TWO_FACTOR_USER_DEFAULTS,
      twoFactorEnabled: true,
      lastLoginAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    mock.method(userRepository, "findByEmail", async () => twoFactorUser);
    mock.method(userRepository, "updateLastLogin", async () => {
      throw new Error("must not update last login");
    });
    mock.method(twoFactorChallengeRepository, "insert", async () => ({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    }));
    mock.method(twoFactorChallengeRepository, "deleteStaleForUser", async () => 0);

    const login = await apiRequest(baseUrl, "/api/auth/login", {
      method: "POST",
      body: { email: "twofactor@example.com", password: "password12" },
    });
    assert.equal(login.status, 200);
    const data = login.body.data as {
      requiresTwoFactor?: boolean;
      token?: string;
      challengeToken?: string;
    };
    assert.equal(data.requiresTwoFactor, true);
    assert.equal(data.token, undefined);
    assert.ok(data.challengeToken);

    const me = await apiRequest(baseUrl, "/api/auth/me", { token: data.challengeToken });
    assert.equal(me.status, 401);

    const payload = jwt.verify(data.challengeToken, env.TWO_FACTOR_CHALLENGE_SECRET) as {
      purpose: string;
    };
    assert.equal(payload.purpose, "2fa_login");
    assert.throws(() => jwt.verify(data.challengeToken, env.JWT_SECRET));
  });

  it("rate-limits 2FA login attempts regardless of code correctness", async () => {
    mock.method(twoFactorService, "completeLogin", async () => {
      throw new AppError(401, "INVALID_TWO_FACTOR_CODE", "Código de autenticación inválido.");
    });
    const max = env.TWO_FACTOR_LOGIN_RATE_LIMIT_MAX;
    let last = { status: 0, body: {} as Record<string, unknown> };
    for (let i = 0; i <= max; i += 1) {
      last = await apiRequest(baseUrl, "/api/auth/login/2fa", {
        method: "POST",
        body: { challengeToken: "same-challenge-token-aaaaaaaaaaaaaaaa", code: "123456" },
      });
    }
    assert.equal(last.status, 429);
    assert.equal((last.body.error as { code?: string })?.code, "RATE_LIMITED");
  });

  it("requires password on 2FA confirm", async () => {
    const token = signTestToken({
      userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      email: "twofactor@example.com",
      role: "ADMIN",
    });
    mock.method(userRepository, "findById", async () => ({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "2FA",
      email: "twofactor@example.com",
      passwordHash: "hash",
      role: "ADMIN" as const,
      isPlatformAdmin: false,
      active: true,
      tokenVersion: 0,
      ...TWO_FACTOR_USER_DEFAULTS,
      lastLoginAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    const response = await apiRequest(baseUrl, "/api/auth/2fa/confirm", {
      method: "POST",
      token,
      body: { code: "123456" },
    });
    assert.equal(response.status, 400);
  });

  it("requires password on 2FA reconfigure setup", async () => {
    const token = signTestToken({
      userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      email: "twofactor@example.com",
      role: "ADMIN",
    });
    mock.method(userRepository, "findById", async () => ({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "2FA",
      email: "twofactor@example.com",
      passwordHash: "hash",
      role: "ADMIN" as const,
      isPlatformAdmin: false,
      active: true,
      tokenVersion: 0,
      ...TWO_FACTOR_USER_DEFAULTS,
      twoFactorEnabled: true,
      lastLoginAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    const response = await apiRequest(baseUrl, "/api/auth/2fa/reconfigure/setup", {
      method: "POST",
      token,
      body: { code: "123456" },
    });
    assert.equal(response.status, 400);
  });

  it("rate-limits authenticated 2FA confirm, disable, and recovery regenerate", async () => {
    const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const token = signTestToken({
      userId,
      email: "twofactor@example.com",
      role: "ADMIN",
    });
    mock.method(userRepository, "findById", async () => ({
      id: userId,
      name: "2FA",
      email: "twofactor@example.com",
      passwordHash: "hash",
      role: "ADMIN" as const,
      isPlatformAdmin: false,
      active: true,
      tokenVersion: 0,
      ...TWO_FACTOR_USER_DEFAULTS,
      lastLoginAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    mock.method(twoFactorService, "confirmSetup", async () => {
      throw new AppError(401, "INVALID_CREDENTIALS", "Credenciales inválidas.");
    });
    mock.method(twoFactorService, "disable", async () => {
      throw new AppError(401, "INVALID_CREDENTIALS", "Credenciales inválidas.");
    });
    mock.method(twoFactorService, "regenerateRecoveryCodes", async () => {
      throw new AppError(401, "INVALID_CREDENTIALS", "Credenciales inválidas.");
    });
    mock.method(twoFactorService, "startReconfigure", async () => {
      throw new AppError(401, "INVALID_CREDENTIALS", "Credenciales inválidas.");
    });

    const max = env.TWO_FACTOR_LOGIN_RATE_LIMIT_MAX;
    const hitUntilLimited = async (path: string, body: Record<string, string>) => {
      resetRateLimitBucketsForTests();
      let last = { status: 0, body: {} as Record<string, unknown> };
      for (let i = 0; i <= max; i += 1) {
        last = await apiRequest(baseUrl, path, { method: "POST", token, body });
      }
      assert.equal(last.status, 429);
      assert.equal((last.body.error as { code?: string })?.code, "RATE_LIMITED");
    };

    await hitUntilLimited("/api/auth/2fa/confirm", { password: "password12", code: "123456" });
    await hitUntilLimited("/api/auth/2fa/disable", { password: "password12", code: "123456" });
    await hitUntilLimited("/api/auth/2fa/recovery-codes/regenerate", {
      password: "password12",
      code: "123456",
    });
    await hitUntilLimited("/api/auth/2fa/reconfigure/setup", {
      password: "password12",
      code: "123456",
    });
  });
});
