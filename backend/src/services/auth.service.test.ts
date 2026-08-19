import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { afterEach, describe, it, mock } from "node:test";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";

setupUnitTestEnv();

import { env } from "../config/env";
import { AppError } from "../errors/app-error";
import { userRepository } from "../repositories/user.repository";
import { authService } from "../services/auth.service";
import type { User } from "../types/auth";
import { TWO_FACTOR_USER_DEFAULTS } from "../types/auth";
import { DUMMY_PASSWORD_HASH, hashPassword } from "../utils/password";

const baseUser = async (overrides: Partial<User> = {}): Promise<User> => ({
  id: "11111111-1111-4111-8111-111111111111",
  name: "Operador",
  email: "ops@example.com",
  passwordHash: await hashPassword("correct-password"),
  role: "ADMIN",
  isPlatformAdmin: false,
  active: true,
  tokenVersion: 0,
  ...TWO_FACTOR_USER_DEFAULTS,
  lastLoginAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

describe("authService.login", () => {
  afterEach(() => {
    mock.reset();
  });

  it("issues a JWT that includes tokenVersion", async () => {
    const user = await baseUser({ tokenVersion: 3 });
    mock.method(userRepository, "findByEmail", async () => user);
    mock.method(userRepository, "updateLastLogin", async () => undefined);

    const result = await authService.login("  OPS@example.com ", "correct-password");
    assert.equal(result.requiresTwoFactor, false);
    if (result.requiresTwoFactor) {
      throw new Error("expected session login");
    }
    const payload = jwt.verify(result.token, env.JWT_SECRET) as { tokenVersion: number; userId: string };
    assert.equal(payload.tokenVersion, 3);
    assert.equal(payload.userId, user.id);
    assert.equal(result.user.email, "ops@example.com");
  });

  it("returns the same public error for missing, wrong password, and inactive users", async () => {
    mock.method(userRepository, "findByEmail", async () => null);
    mock.method(userRepository, "updateLastLogin", async () => undefined);

    await assert.rejects(
      () => authService.login("nobody@example.com", "whatever-password"),
      (error: unknown) =>
        error instanceof AppError && error.statusCode === 401 && error.code === "INVALID_CREDENTIALS",
    );

    const active = await baseUser();
    mock.method(userRepository, "findByEmail", async () => active);
    await assert.rejects(
      () => authService.login("ops@example.com", "wrong-password"),
      (error: unknown) =>
        error instanceof AppError && error.statusCode === 401 && error.code === "INVALID_CREDENTIALS",
    );

    const inactive = await baseUser({ active: false });
    mock.method(userRepository, "findByEmail", async () => inactive);
    await assert.rejects(
      () => authService.login("ops@example.com", "correct-password"),
      (error: unknown) =>
        error instanceof AppError && error.statusCode === 401 && error.code === "INVALID_CREDENTIALS",
    );
  });

  it("does not treat the dummy hash as a match for a normal password", async () => {
    const { verifyPassword } = await import("../utils/password");
    assert.equal(await verifyPassword("correct-password", DUMMY_PASSWORD_HASH), false);
  });

  it("returns a 2FA challenge and does not bump last login or issue a session JWT", async () => {
    const user = await baseUser({ twoFactorEnabled: true, tokenVersion: 4 });
    mock.method(userRepository, "findByEmail", async () => user);
    mock.method(userRepository, "updateLastLogin", async () => {
      throw new Error("last_login must not update after password only");
    });
    const { twoFactorChallengeRepository } = await import(
      "../repositories/two-factor-challenge.repository"
    );
    mock.method(twoFactorChallengeRepository, "insert", async () => ({ id: "challenge-id" }));

    const result = await authService.login("ops@example.com", "correct-password");
    assert.equal(result.requiresTwoFactor, true);
    if (!result.requiresTwoFactor) {
      throw new Error("expected challenge");
    }
    assert.equal("token" in result, false);

    assert.throws(() => jwt.verify(result.challengeToken, env.JWT_SECRET));
    const payload = jwt.verify(result.challengeToken, env.TWO_FACTOR_CHALLENGE_SECRET) as {
      purpose: string;
      tokenVersion: number;
    };
    assert.equal(payload.purpose, "2fa_login");
    assert.equal(payload.tokenVersion, 4);
  });
});
