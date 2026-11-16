import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it, mock } from "node:test";
import express from "express";
import { authenticate } from "../middleware/authenticate";
import { errorHandler } from "../middleware/error-handler";
import { billingCommercialRouter } from "./billing-commercial.routes";
import { billingNegotiatedContractService } from "../services/billing/billing-negotiated-contract.service";
import { apiRequest, signTestToken, startTestServer } from "../test-helpers/http-test";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import { userRepository } from "../repositories/identity/user.repository";

setupUnitTestEnv();

const COMPANY_ID = "a1b2c3d4-e5f6-4789-a012-3456789abcde";
const SUBSCRIPTION_ID = "b1b2c3d4-e5f6-4789-a012-3456789abcde";

describe("billing commercial HTTP authorization", () => {
  let baseUrl = "";
  let close: (() => Promise<void>) | null = null;

  before(async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/platform/billing", authenticate, billingCommercialRouter);
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

  it("returns 401 without token on contracts list", async () => {
    const response = await apiRequest(baseUrl, `/api/platform/billing/companies/${COMPANY_ID}/contracts`);
    assert.equal(response.status, 401);
  });

  it("returns 403 for non-platform admin", async () => {
    mock.method(userRepository, "findById", async () => ({
      id: "u1",
      active: true,
      isPlatformAdmin: false,
    }));
    const token = signTestToken({ userId: "u1", email: "u1@test.local", role: "ADMIN" });
    const response = await apiRequest(baseUrl, `/api/platform/billing/companies/${COMPANY_ID}/contracts`, {
      token,
    });
    assert.equal(response.status, 403);
    assert.equal((response.body.error as { code?: string })?.code, "PLATFORM_ADMIN_REQUIRED");
  });

  it("allows platform admin to list contracts", async () => {
    mock.method(userRepository, "findById", async () => ({
      id: "super-1",
      active: true,
      isPlatformAdmin: true,
    }));
    mock.method(
      billingNegotiatedContractService,
      "getCompanyCommercialContracts",
      async () => ({
        companyId: COMPANY_ID,
        billingPolicy: { companyId: COMPANY_ID, isExempt: false },
        subscriptions: [],
        currentSubscription: null,
        currentTerms: null,
        termsHistory: [],
        catalogComparison: null,
        isCustomPlan: false,
      }),
    );
    const token = signTestToken({
      userId: "super-1",
      email: "super@test.local",
      role: "ADMIN",
    });
    const response = await apiRequest(baseUrl, `/api/platform/billing/companies/${COMPANY_ID}/contracts`, {
      token,
    });
    assert.equal(response.status, 200);
  });

  it("rejects contractual terms route when company does not own subscription", async () => {
    mock.method(userRepository, "findById", async () => ({
      id: "super-1",
      active: true,
      isPlatformAdmin: true,
    }));
    mock.method(billingNegotiatedContractService, "modifyContractualTerms", async () => {
      const { AppError } = await import("../errors/app-error");
      throw new AppError(403, "BILLING_SUBSCRIPTION_COMPANY_MISMATCH", "Mismatch");
    });
    const token = signTestToken({
      userId: "super-1",
      email: "super@test.local",
      role: "ADMIN",
    });
    const response = await apiRequest(
      baseUrl,
      `/api/platform/billing/companies/${COMPANY_ID}/subscriptions/${SUBSCRIPTION_ID}/contractual-terms`,
      {
        method: "POST",
        token,
        body: {
          agreedAmount: "300.000000",
          currency: "USD",
          billingPeriod: "MONTHLY",
          seatMin: 1,
          seatMax: 100,
          effectiveFrom: "2027-01-01T00:00:00.000Z",
        },
      },
    );
    assert.equal(response.status, 403);
    assert.equal(
      (response.body.error as { code?: string })?.code,
      "BILLING_SUBSCRIPTION_COMPANY_MISMATCH",
    );
  });
});