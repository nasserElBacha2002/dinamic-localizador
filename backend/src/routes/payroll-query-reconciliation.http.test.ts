import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it, mock } from "node:test";
import express from "express";
import { authenticate } from "../middleware/authenticate";
import { errorHandler } from "../middleware/error-handler";
import { userRepository } from "../repositories/user.repository";
import { payrollQueryReconciliationService } from "../services/payroll-query-reconciliation.service";
import { apiRequest, signTestToken, startTestServer } from "../test-helpers/http-test";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import { platformCompanyRouter } from "./platform-company.routes";

setupUnitTestEnv();

const COMPANY_ID = "a1b2c3d4-e5f6-4789-a012-3456789abcde";
const DELIVERY_ID = "11111111-1111-4111-8111-111111111111";
const COMMAND_ID = "22222222-2222-4222-8222-222222222222";

describe("payroll query reconciliation HTTP authorization", () => {
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

  after(async () => close?.());
  beforeEach(() => mock.reset());

  it("rejects unauthenticated and non-platform users", async () => {
    const path = `/api/platform/companies/${COMPANY_ID}/whatsapp/payroll-query-deliveries/reconciliation-required`;
    assert.equal((await apiRequest(baseUrl, path)).status, 401);

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
    assert.equal((await apiRequest(baseUrl, path, { token })).status, 403);
  });

  it("lists only through the company-scoped platform endpoint", async () => {
    mock.method(userRepository, "findById", async () => ({
      id: "super-1",
      active: true,
      isPlatformAdmin: true,
    }));
    mock.method(payrollQueryReconciliationService, "list", async (companyId) => ({
      items: [],
      count: companyId === COMPANY_ID ? 0 : -1,
      oldestUnresolvedAt: null,
    }));
    const token = signTestToken({
      userId: "super-1",
      email: "super@example.com",
      role: "ADMIN",
    });
    const response = await apiRequest(
      baseUrl,
      `/api/platform/companies/${COMPANY_ID}/whatsapp/payroll-query-deliveries/reconciliation-required`,
      { token },
    );
    assert.equal(response.status, 200);
    assert.equal((response.body as { data: { count: number } }).data.count, 0);
  });

  it("validates provider evidence before invoking reconciliation", async () => {
    mock.method(userRepository, "findById", async () => ({
      id: "super-1",
      active: true,
      isPlatformAdmin: true,
    }));
    let calls = 0;
    mock.method(payrollQueryReconciliationService, "reconcile", async () => {
      calls += 1;
      throw new Error("must not be called");
    });
    const token = signTestToken({
      userId: "super-1",
      email: "super@example.com",
      role: "ADMIN",
    });
    const response = await apiRequest(
      baseUrl,
      `/api/platform/companies/${COMPANY_ID}/whatsapp/payroll-query-deliveries/${DELIVERY_ID}/reconcile`,
      {
        method: "POST",
        token,
        body: {
          commandId: COMMAND_ID,
          expectedProcessingVersion: 1,
          resolution: "CONFIRMED_ACCEPTED",
          reason: "Verificado en proveedor",
        },
      },
    );
    assert.equal(response.status, 400);
    assert.equal(calls, 0);
  });
});
