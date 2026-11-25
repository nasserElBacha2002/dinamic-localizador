/**
 * DIN-463 — commercial seat quota policy scenarios (integration).
 */
import assert from "node:assert/strict";
import { after, before, it } from "node:test";
import { randomUUID } from "node:crypto";
import sql from "mssql";
import { getPool } from "../../database/connection";
import { AppError } from "../../errors/app-error";
import { employeeService } from "../employees/employee.service";
import { billingCatalogService } from "./billing-catalog.service";
import { billingSubscriptionService } from "./billing-subscription.service";
import { companySettingsRepository } from "../../repositories/companies/company-settings.repository";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../../test-helpers/integration-test";
import { createIntegrationFixtureTracker } from "../../test-helpers/integration-cleanup";
import { createPlatformCompanyFixture } from "../../test-helpers/platform-company-fixture";
import { env } from "../../config/env";

const phone = (): string => `+54911${randomUUID().replace(/\D/g, "").slice(0, 8)}`;

describeDatabaseIntegration("commercial seat quota policy integration", () => {
  const fixtures = createIntegrationFixtureTracker();
  let previousGlobalMode: (typeof env)["COMMERCIAL_SEAT_QUOTA_GLOBAL_MODE"];

  before(async () => {
    previousGlobalMode = env.COMMERCIAL_SEAT_QUOTA_GLOBAL_MODE;
    env.COMMERCIAL_SEAT_QUOTA_GLOBAL_MODE = "ENFORCE";
    await setupDatabaseIntegration();
  });

  after(async () => {
    env.COMMERCIAL_SEAT_QUOTA_GLOBAL_MODE = previousGlobalMode;
    await fixtures.cleanup();
    await teardownDatabaseIntegration();
  });

  it("allows create when global DISABLED without subscription", async () => {
    env.COMMERCIAL_SEAT_QUOTA_GLOBAL_MODE = "DISABLED";
    const suffix = randomUUID().slice(0, 8);
    const fixture = await createPlatformCompanyFixture({
      name: `Disabled mode ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: { name: "Owner", email: `disabled-${suffix}@test.local` },
    });
    fixtures.trackCompany(fixture.data.company.id);
    await employeeService.create(fixture.data.company.id, {
      name: "No sub",
      phoneNumber: phone(),
      employeeType: "fijo",
    });
    env.COMMERCIAL_SEAT_QUOTA_GLOBAL_MODE = "ENFORCE";
  });

  it("allows create without subscription under ENFORCE (inconsistency logged)", async () => {
    const suffix = randomUUID().slice(0, 8);
    const fixture = await createPlatformCompanyFixture({
      name: `No contract ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: { name: "Owner", email: `nocontract-${suffix}@test.local` },
    });
    const companyId = fixture.data.company.id;
    fixtures.trackCompany(companyId);
    await companySettingsRepository.updateCommercialSeatQuotaMode(companyId, "ENFORCE");
    await employeeService.create(companyId, {
      name: "Legacy tenant",
      phoneNumber: phone(),
      employeeType: "fijo",
    });

    const events = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT decision, reason_code
        FROM dbo.commercial_seat_quota_events
        WHERE company_id = @companyId
          AND reason_code = N'NO_VIGENT_SUBSCRIPTION'
      `);
    assert.ok(Number(events.recordset.length) >= 1);
  });

  it("rejects second active employee when seat_max=1", async () => {
    const suffix = randomUUID().slice(0, 8);
    const fixture = await createPlatformCompanyFixture({
      name: `Finite ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: { name: "Owner", email: `finite-${suffix}@test.local` },
    });
    const companyId = fixture.data.company.id;
    fixtures.trackCompany(companyId);
    await companySettingsRepository.updateCommercialSeatQuotaMode(companyId, "ENFORCE");

    const plan = await billingCatalogService.createPlan({
      planCode: `FIN_${suffix}`,
      displayName: "Finite",
      planKind: "CUSTOM",
    });
    await billingSubscriptionService.createAdminSubscription({
      companyId,
      billingPlanId: plan.id,
      subscriptionStatus: "ACTIVE",
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      initialTerms: {
        agreedAmount: "50",
        currency: "USD",
        billingPeriod: "MONTHLY",
        seatMin: 1,
        seatMax: 1,
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      },
    });

    await employeeService.create(companyId, {
      name: "First",
      phoneNumber: phone(),
      employeeType: "fijo",
    });

    await assert.rejects(
      () =>
        employeeService.create(companyId, {
          name: "Second",
          phoneNumber: phone(),
          employeeType: "fijo",
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "COMMERCIAL_SEAT_LIMIT_EXCEEDED",
    );
  });
});