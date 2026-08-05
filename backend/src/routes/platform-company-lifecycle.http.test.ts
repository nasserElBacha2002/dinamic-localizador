import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it, mock } from "node:test";
import express from "express";
import { authenticate } from "../middleware/authenticate";
import { errorHandler } from "../middleware/error-handler";
import { platformCompanyRouter } from "./platform-company.routes";
import { apiRequest, signTestToken, startTestServer } from "../test-helpers/http-test";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import { userRepository } from "../repositories/user.repository";
import { companyLifecycleService } from "../services/company-lifecycle.service";

setupUnitTestEnv();

const COMPANY_ID = "a1b2c3d4-e5f6-4789-a012-3456789abcde";

const lifecycleDto = {
  companyId: COMPANY_ID,
  name: "Acme Ops",
  status: "PENDING_DELETION",
  deactivatedAt: "2026-08-05T12:00:00.000Z",
  deactivatedByUserId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  deactivationReason: "Falta de pago",
  scheduledDeletionAt: "2026-09-04T12:00:00.000Z",
  reactivatedAt: null,
  reactivatedByUserId: null,
  deletionStartedAt: null,
  deletedAt: null,
  deletionAttempts: 0,
  deletionLastError: null,
  gracePeriodDays: 30,
  daysRemaining: 30,
};

describe("platform company lifecycle HTTP authorization", () => {
  let baseUrl = "";
  let close: (() => Promise<void>) | null = null;

  before(async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/platform", authenticate, platformCompanyRouter);
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

  beforeEach(() => {
    mock.reset();
  });

  it("returns 401 without token on deactivate", async () => {
    const response = await apiRequest(
      baseUrl,
      `/api/platform/companies/${COMPANY_ID}/deactivate`,
      { method: "POST", body: { reason: "Motivo de prueba" } },
    );
    assert.equal(response.status, 401);
  });

  it("returns 403 for non platform admin on deactivate", async () => {
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
    const response = await apiRequest(
      baseUrl,
      `/api/platform/companies/${COMPANY_ID}/deactivate`,
      {
        method: "POST",
        token,
        body: { reason: "Motivo de prueba" },
      },
    );
    assert.equal(response.status, 403);
    assert.equal((response.body.error as { code?: string })?.code, "PLATFORM_ADMIN_REQUIRED");
  });

  it("allows platform admin deactivate", async () => {
    mock.method(userRepository, "findById", async () => ({
      id: "super-1",
      active: true,
      isPlatformAdmin: true,
    }));
    mock.method(companyLifecycleService, "deactivate", async () => lifecycleDto);
    const token = signTestToken({
      userId: "super-1",
      email: "super@example.com",
      role: "ADMIN",
    });
    const response = await apiRequest(
      baseUrl,
      `/api/platform/companies/${COMPANY_ID}/deactivate`,
      {
        method: "POST",
        token,
        body: { reason: "Falta de pago o solicitud administrativa" },
      },
    );
    assert.equal(response.status, 200);
    assert.equal((response.body as { data: { status: string } }).data.status, "PENDING_DELETION");
  });

  it("allows platform admin reactivate", async () => {
    mock.method(userRepository, "findById", async () => ({
      id: "super-1",
      active: true,
      isPlatformAdmin: true,
    }));
    mock.method(companyLifecycleService, "reactivate", async () => ({
      ...lifecycleDto,
      status: "ACTIVE",
      scheduledDeletionAt: null,
    }));
    const token = signTestToken({
      userId: "super-1",
      email: "super@example.com",
      role: "ADMIN",
    });
    const response = await apiRequest(
      baseUrl,
      `/api/platform/companies/${COMPANY_ID}/reactivate`,
      { method: "POST", token },
    );
    assert.equal(response.status, 200);
    assert.equal((response.body as { data: { status: string } }).data.status, "ACTIVE");
  });

  it("allows platform admin deletion-status", async () => {
    mock.method(userRepository, "findById", async () => ({
      id: "super-1",
      active: true,
      isPlatformAdmin: true,
    }));
    mock.method(companyLifecycleService, "getDeletionStatus", async () => lifecycleDto);
    const token = signTestToken({
      userId: "super-1",
      email: "super@example.com",
      role: "ADMIN",
    });
    const response = await apiRequest(
      baseUrl,
      `/api/platform/companies/${COMPANY_ID}/deletion-status`,
      { token },
    );
    assert.equal(response.status, 200);
    assert.equal((response.body as { data: { daysRemaining: number } }).data.daysRemaining, 30);
  });
});
