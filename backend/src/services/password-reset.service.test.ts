import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";

setupUnitTestEnv();

import { env } from "../config/env";
import { passwordResetTokenRepository } from "../repositories/password-reset-token.repository";
import { userRepository } from "../repositories/user.repository";
import {
  PASSWORD_RESET_PUBLIC_MESSAGE,
  passwordResetIssuer,
  passwordResetMailer,
  passwordResetService,
} from "../services/password-reset.service";
import type { User } from "../types/auth";
import { TWO_FACTOR_USER_DEFAULTS } from "../types/auth";

const activeUser: User = {
  id: "44444444-4444-4444-8444-444444444444",
  name: "Activo",
  email: "active@example.com",
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

describe("passwordResetService.forgotPassword", () => {
  afterEach(() => {
    mock.reset();
    env.EMAIL_TRANSPORT = "console";
  });

  it("returns the same message and does not email missing users", async () => {
    mock.method(userRepository, "findByEmail", async () => null);
    const result = await passwordResetService.forgotPassword("  Someone@Example.COM ");
    assert.equal(result.message, PASSWORD_RESET_PUBLIC_MESSAGE);
  });

  it("returns the same message for inactive users without sending email", async () => {
    const inactive: User = {
      id: "33333333-3333-4333-8333-333333333333",
      name: "Inactivo",
      email: "inactive@example.com",
      passwordHash: "hash",
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
    const result = await passwordResetService.forgotPassword("inactive@example.com");
    assert.equal(result.message, PASSWORD_RESET_PUBLIC_MESSAGE);
  });

  it("returns the public message when SMTP throws and compensation consume fails", async () => {
    mock.method(userRepository, "findByEmail", async () => activeUser);
    mock.method(passwordResetIssuer, "issueForUser", async () => ({
      rawToken: "issued-raw-token",
      tokenId: "55555555-5555-4555-8555-555555555555",
      expiresAt: new Date(Date.now() + 60_000),
    }));
    mock.method(passwordResetMailer, "send", async () => {
      throw new Error("SMTP down");
    });
    mock.method(passwordResetTokenRepository, "consumeById", async () => {
      throw new Error("DB compensation failed");
    });

    const result = await passwordResetService.forgotPassword(activeUser.email);
    assert.equal(result.message, PASSWORD_RESET_PUBLIC_MESSAGE);
  });

  it("returns the public message when SMTP returns sent=false and compensation fails", async () => {
    env.EMAIL_TRANSPORT = "smtp";
    mock.method(userRepository, "findByEmail", async () => activeUser);
    mock.method(passwordResetIssuer, "issueForUser", async () => ({
      rawToken: "issued-raw-token",
      tokenId: "66666666-6666-4666-8666-666666666666",
      expiresAt: new Date(Date.now() + 60_000),
    }));
    mock.method(passwordResetMailer, "send", async () => ({
      sent: false,
      messageId: null,
      transport: "smtp" as const,
      publicErrorCode: "SMTP_NOT_ACCEPTED",
    }));
    mock.method(passwordResetTokenRepository, "consumeById", async () => {
      throw new Error("DB compensation failed");
    });

    const result = await passwordResetService.forgotPassword(activeUser.email);
    assert.equal(result.message, PASSWORD_RESET_PUBLIC_MESSAGE);
  });

  it("matches the missing-user public message after SMTP and compensation failures", async () => {
    mock.method(userRepository, "findByEmail", async () => null);
    const missing = await passwordResetService.forgotPassword("missing@example.com");

    mock.method(userRepository, "findByEmail", async () => activeUser);
    mock.method(passwordResetIssuer, "issueForUser", async () => ({
      rawToken: "issued-raw-token",
      tokenId: "77777777-7777-4777-8777-777777777777",
      expiresAt: new Date(Date.now() + 60_000),
    }));
    mock.method(passwordResetMailer, "send", async () => {
      throw new Error("SMTP down");
    });
    mock.method(passwordResetTokenRepository, "consumeById", async () => {
      throw new Error("DB compensation failed");
    });
    const failed = await passwordResetService.forgotPassword(activeUser.email);

    assert.deepEqual(failed, missing);
  });
});
