import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { AppError } from "../errors/app-error";
import { DEFAULT_COMPANY_OPERATIONAL_SETTINGS } from "../constants/company-settings";
import { operationRepository } from "../repositories/operation.repository";
import { serviceRepository } from "../repositories/service.repository";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";

const COMPANY_ID = "company-1";
const STORE_ID = "store-1";
const FUTURE_START = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
const FUTURE_END = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString();

const activeStore = {
  id: STORE_ID,
  name: "Service 1",
  address: "Addr",
  neighborhood: null,
  locality: null,
  storeFormat: null,
  latitude: -34.6,
  longitude: -58.38,
  allowedRadiusMeters: 150,
  googlePlaceId: null,
  active: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const createdOperation = {
  id: "inventory-1",
  serviceId: STORE_ID,
  scheduledStart: FUTURE_START,
  scheduledEnd: FUTURE_END,
  earlyToleranceMinutes: 45,
  lateToleranceMinutes: 75,
  status: "SCHEDULED" as const,
  notes: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("operationService.create", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("uses company defaults when tolerances are omitted", async () => {
    setupUnitTestEnv();
    const { companyOperationalDefaultsResolver } = await import(
      "./company-operational-defaults.resolver"
    );
    const { operationService } = await import("./operation.service");

    let resolverCompanyId = "";
    mock.method(companyOperationalDefaultsResolver, "getInventoryDefaults", async (companyId) => {
      resolverCompanyId = companyId;
      return {
        companyId,
        earlyToleranceMinutes: 45,
        lateToleranceMinutes: 75,
        source: "company_settings" as const,
      };
    });
    mock.method(serviceRepository, "findById", async () => activeStore);
    mock.method(operationRepository, "create", async (_companyId, input) => ({
      ...createdOperation,
      earlyToleranceMinutes: input.earlyToleranceMinutes!,
      lateToleranceMinutes: input.lateToleranceMinutes!,
    }));

    const result = await operationService.create(COMPANY_ID, {
      serviceId: STORE_ID,
      scheduledStart: FUTURE_START,
      scheduledEnd: FUTURE_END,
    });

    assert.equal(resolverCompanyId, COMPANY_ID);
    assert.equal(result.earlyToleranceMinutes, 45);
    assert.equal(result.lateToleranceMinutes, 75);
  });

  it("keeps explicit tolerances when provided", async () => {
    setupUnitTestEnv();
    const { companyOperationalDefaultsResolver } = await import(
      "./company-operational-defaults.resolver"
    );
    const { operationService } = await import("./operation.service");

    let resolverCalls = 0;
    mock.method(companyOperationalDefaultsResolver, "getInventoryDefaults", async () => {
      resolverCalls += 1;
      return {
        companyId: COMPANY_ID,
        earlyToleranceMinutes: 45,
        lateToleranceMinutes: 75,
        source: "company_settings" as const,
      };
    });
    mock.method(serviceRepository, "findById", async () => activeStore);
    mock.method(operationRepository, "create", async (_companyId, input) => ({
      ...createdOperation,
      earlyToleranceMinutes: input.earlyToleranceMinutes!,
      lateToleranceMinutes: input.lateToleranceMinutes!,
    }));

    const result = await operationService.create(COMPANY_ID, {
      serviceId: STORE_ID,
      scheduledStart: FUTURE_START,
      scheduledEnd: FUTURE_END,
      earlyToleranceMinutes: 10,
      lateToleranceMinutes: 20,
    });

    assert.equal(resolverCalls, 1);
    assert.equal(result.earlyToleranceMinutes, 10);
    assert.equal(result.lateToleranceMinutes, 20);
  });

  it("rejects negative tolerances at schema validation layer", async () => {
    setupUnitTestEnv();
    const { createInventorySchema } = await import("../schemas/operation.schema");

    const parsed = createInventorySchema.safeParse({
      serviceId: STORE_ID,
      scheduledStart: FUTURE_START,
      scheduledEnd: FUTURE_END,
      earlyToleranceMinutes: -1,
      lateToleranceMinutes: 90,
    });

    assert.equal(parsed.success, false);
  });

  it("rejects inactive stores before resolving defaults", async () => {
    setupUnitTestEnv();
    const { companyOperationalDefaultsResolver } = await import(
      "./company-operational-defaults.resolver"
    );
    const { operationService } = await import("./operation.service");

    let resolverCalls = 0;
    mock.method(companyOperationalDefaultsResolver, "getInventoryDefaults", async () => {
      resolverCalls += 1;
      return {
        companyId: COMPANY_ID,
        earlyToleranceMinutes: 45,
        lateToleranceMinutes: 75,
        source: "company_settings" as const,
      };
    });
    mock.method(serviceRepository, "findById", async () => ({ ...activeStore, active: false }));

    await assert.rejects(
      () =>
        operationService.create(COMPANY_ID, {
          serviceId: STORE_ID,
          scheduledStart: FUTURE_START,
          scheduledEnd: FUTURE_END,
        }),
      (error: unknown) => error instanceof AppError && error.code === "STORE_INACTIVE",
    );
    assert.equal(resolverCalls, 0);
  });

  it("falls back to application defaults through resolver when company row is missing", async () => {
    setupUnitTestEnv();
    const { companySettingsRepository } = await import("../repositories/company-settings.repository");
    const { operationService } = await import("./operation.service");

    mock.method(companySettingsRepository, "findByCompanyId", async () => null);
    mock.method(serviceRepository, "findById", async () => activeStore);
    mock.method(operationRepository, "create", async (_companyId, input) => ({
      ...createdOperation,
      earlyToleranceMinutes: input.earlyToleranceMinutes!,
      lateToleranceMinutes: input.lateToleranceMinutes!,
    }));

    const result = await operationService.create(COMPANY_ID, {
      serviceId: STORE_ID,
      scheduledStart: FUTURE_START,
      scheduledEnd: FUTURE_END,
    });

    assert.equal(
      result.earlyToleranceMinutes,
      DEFAULT_COMPANY_OPERATIONAL_SETTINGS.defaultEarlyArrivalToleranceMinutes,
    );
    assert.equal(
      result.lateToleranceMinutes,
      DEFAULT_COMPANY_OPERATIONAL_SETTINGS.defaultLateArrivalToleranceMinutes,
    );
  });
});
