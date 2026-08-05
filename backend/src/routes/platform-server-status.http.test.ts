import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it, mock } from "node:test";
import express from "express";
import { authenticate } from "../middleware/authenticate";
import { platformServerStatusRouter } from "./platform-server-status.routes";
import { apiRequest, signTestToken, startTestServer } from "../test-helpers/http-test";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import { userRepository } from "../repositories/user.repository";
import { serverStatusService } from "../services/server-status.service";

setupUnitTestEnv();

const okSnapshot = {
  status: "ok" as const,
  backend: {
    status: "ok" as const,
    service: "dinamic-attendance-api",
    checkedAt: "2026-08-04T12:00:00.000Z",
  },
  database: {
    status: "ok" as const,
    message: null,
    durationMs: 1,
    checkedAt: "2026-08-04T12:00:00.000Z",
  },
  gcs: {
    status: "disabled" as const,
    message: "Almacenamiento no configurado",
    durationMs: 1,
    checkedAt: "2026-08-04T12:00:00.000Z",
  },
  timestamp: "2026-08-04T12:00:00.000Z",
};

describe("platform server status HTTP authorization", () => {
  let baseUrl = "";
  let close: (() => Promise<void>) | null = null;

  before(async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/platform/servers", authenticate, platformServerStatusRouter);
    const started = await startTestServer(app);
    baseUrl = started.baseUrl;
    close = started.close;
  });

  after(async () => {
    if (close) {
      await close();
    }
  });

  beforeEach(() => {
    mock.reset();
    mock.method(serverStatusService, "getPlatformStatus", async () => okSnapshot);
  });

  it("returns 401 without token", async () => {
    mock.method(userRepository, "findById", async () => ({
      id: "u1",
      active: true,
      isPlatformAdmin: true,
    }));
    const response = await apiRequest(baseUrl, "/api/platform/servers/status");
    assert.equal(response.status, 401);
    assert.equal((response.body.error as { code?: string })?.code, "UNAUTHORIZED");
  });

  it("returns 403 for company admin", async () => {
    mock.method(userRepository, "findById", async () => ({
      id: "admin-1",
      active: true,
      isPlatformAdmin: false,
      role: "ADMIN",
    }));
    const token = signTestToken({
      userId: "admin-1",
      email: "admin@example.com",
      role: "ADMIN",
    });
    const response = await apiRequest(baseUrl, "/api/platform/servers/status", { token });
    assert.equal(response.status, 403);
    assert.equal((response.body.error as { code?: string })?.code, "PLATFORM_ADMIN_REQUIRED");
  });

  it("returns 403 for standard user", async () => {
    mock.method(userRepository, "findById", async () => ({
      id: "op-1",
      active: true,
      isPlatformAdmin: false,
      role: "OPERATOR",
    }));
    const token = signTestToken({
      userId: "op-1",
      email: "op@example.com",
      role: "OPERATOR",
    });
    const response = await apiRequest(baseUrl, "/api/platform/servers/status", { token });
    assert.equal(response.status, 403);
  });

  it("returns 403 for inactive user even if flagged platform admin", async () => {
    mock.method(userRepository, "findById", async () => ({
      id: "super-inactive",
      active: false,
      isPlatformAdmin: true,
    }));
    const token = signTestToken({
      userId: "super-inactive",
      email: "super@example.com",
      role: "ADMIN",
    });
    const response = await apiRequest(baseUrl, "/api/platform/servers/status", { token });
    assert.equal(response.status, 403);
  });

  it("returns 403 for nonexistent user", async () => {
    mock.method(userRepository, "findById", async () => null);
    const token = signTestToken({
      userId: "missing",
      email: "missing@example.com",
      role: "ADMIN",
    });
    const response = await apiRequest(baseUrl, "/api/platform/servers/status", { token });
    assert.equal(response.status, 403);
  });

  it("returns 403 when JWT role is ADMIN but DB is not platform admin", async () => {
    mock.method(userRepository, "findById", async () => ({
      id: "admin-2",
      active: true,
      isPlatformAdmin: false,
      role: "ADMIN",
    }));
    const token = signTestToken({
      userId: "admin-2",
      email: "admin2@example.com",
      role: "ADMIN",
    });
    const response = await apiRequest(baseUrl, "/api/platform/servers/status", { token });
    assert.equal(response.status, 403);
  });

  it("allows active platform admin with HTTP 200 snapshot including error status", async () => {
    mock.method(userRepository, "findById", async () => ({
      id: "super-1",
      active: true,
      isPlatformAdmin: true,
      email: "super@example.com",
      role: "ADMIN",
    }));
    mock.method(serverStatusService, "getPlatformStatus", async () => ({
      status: "error" as const,
      backend: {
        status: "ok" as const,
        service: "dinamic-attendance-api",
        checkedAt: "2026-08-04T12:00:00.000Z",
      },
      database: {
        status: "error" as const,
        message: "No se pudo conectar con la base de datos",
        durationMs: 8,
        checkedAt: "2026-08-04T12:00:00.000Z",
      },
      gcs: {
        status: "ok" as const,
        message: null,
        durationMs: 3,
        checkedAt: "2026-08-04T12:00:00.000Z",
      },
      timestamp: "2026-08-04T12:00:00.000Z",
    }));

    const token = signTestToken({
      userId: "super-1",
      email: "super@example.com",
      role: "ADMIN",
    });
    const response = await apiRequest(baseUrl, "/api/platform/servers/status", { token });
    assert.equal(response.status, 200);
    assert.equal(response.body.status, "error");
    assert.equal((response.body.database as { status?: string })?.status, "error");
    assert.equal((response.body.gcs as { status?: string })?.status, "ok");
  });
});
