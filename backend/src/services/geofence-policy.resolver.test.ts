import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { AppError } from "../errors/app-error";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";

setupUnitTestEnv();

describe("geofencePolicyResolver", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("prefers service radius then company margin", async () => {
    const { companySettingsRepository } = await import("../repositories/company-settings.repository");
    const { geofencePolicyResolver } = await import("./geofence-policy.resolver");

    mock.method(companySettingsRepository, "findByCompanyId", async () => ({
      companyId: "c1",
      defaultRadiusMeters: 200,
      geofenceReviewMarginMeters: 40,
    }));

    const policy = await geofencePolicyResolver.resolveForService("c1", 120);
    assert.equal(policy.radiusMeters, 120);
    assert.equal(policy.radiusSource, "service");
    assert.equal(policy.marginMeters, 40);
    assert.equal(policy.marginSource, "company_settings");
  });

  it("uses company default radius when service radius is 0", async () => {
    const { companySettingsRepository } = await import("../repositories/company-settings.repository");
    const { geofencePolicyResolver } = await import("./geofence-policy.resolver");

    mock.method(companySettingsRepository, "findByCompanyId", async () => ({
      companyId: "c1",
      defaultRadiusMeters: 200,
      geofenceReviewMarginMeters: null,
    }));

    const policy = await geofencePolicyResolver.resolveForService("c1", 0);
    assert.equal(policy.radiusMeters, 200);
    assert.equal(policy.radiusSource, "company_settings");
    assert.equal(policy.marginMeters, 30);
    assert.equal(policy.marginSource, "environment");
  });

  it("fails closed on repository errors", async () => {
    const { companySettingsRepository } = await import("../repositories/company-settings.repository");
    const { geofencePolicyResolver } = await import("./geofence-policy.resolver");

    mock.method(companySettingsRepository, "findByCompanyId", async () => {
      throw new Error("DB_DOWN");
    });

    await assert.rejects(
      () => geofencePolicyResolver.resolveCompanyDefaults("c1"),
      (error: unknown) =>
        error instanceof AppError && error.code === "GEOFENCE_POLICY_UNAVAILABLE",
    );
  });

  it("resolveFromSettings derives policy without repository IO", async () => {
    const { geofencePolicyResolver } = await import("./geofence-policy.resolver");
    const policy = geofencePolicyResolver.resolveFromSettings(
      "c1",
      { defaultRadiusMeters: 200, geofenceReviewMarginMeters: 40 },
      0,
    );
    assert.equal(policy.radiusMeters, 200);
    assert.equal(policy.marginMeters, 40);
  });
});
