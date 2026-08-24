import assert from "node:assert/strict";
import { after, afterEach, before, describe, it, mock } from "node:test";
import express from "express";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";

setupUnitTestEnv();

import { authenticate } from "../middleware/authenticate";
import { errorHandler } from "../middleware/error-handler";
import { userRepository } from "../repositories/user.repository";
import { apiRequest, signTestToken, startTestServer } from "../test-helpers/http-test";
import type { User } from "../types/auth";
import { TWO_FACTOR_USER_DEFAULTS } from "../types/auth";

const user: User = {
  id: "admin-1",
  name: "Admin",
  email: "admin@example.com",
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

describe("authenticate session checks", () => {
  let baseUrl = "";
  let close: (() => Promise<void>) | null = null;

  before(async () => {
    const app = express();
    app.use(express.json());
    app.get("/api/secure", authenticate, (_req, res) => {
      res.status(200).json({ data: { ok: true } });
    });
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
  });

  it("rejects a cryptographically valid JWT when token_version no longer matches", async () => {
    mock.method(userRepository, "findById", async () => ({ ...user, tokenVersion: 1 }));
    const token = signTestToken({
      userId: user.id,
      email: user.email,
      role: "ADMIN",
      tokenVersion: 0,
    });
    const response = await apiRequest(baseUrl, "/api/secure", { token });
    assert.equal(response.status, 401);
    assert.equal((response.body.error as { code?: string })?.code, "INVALID_TOKEN");
  });

  it("accepts a JWT whose tokenVersion matches the user", async () => {
    mock.method(userRepository, "findById", async () => ({ ...user, tokenVersion: 2 }));
    const token = signTestToken({
      userId: user.id,
      email: user.email,
      role: "ADMIN",
      tokenVersion: 2,
    });
    const response = await apiRequest(baseUrl, "/api/secure", { token });
    assert.equal(response.status, 200);
  });

  it("rejects a valid JWT when the user is inactive", async () => {
    mock.method(userRepository, "findById", async () => ({ ...user, active: false }));
    const token = signTestToken({
      userId: user.id,
      email: user.email,
      role: "ADMIN",
      tokenVersion: 0,
    });
    const response = await apiRequest(baseUrl, "/api/secure", { token });
    assert.equal(response.status, 401);
  });
});
