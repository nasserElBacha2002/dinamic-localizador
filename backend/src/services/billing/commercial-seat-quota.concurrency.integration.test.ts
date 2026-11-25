/**
 * DIN-463 — SQL Server concurrency for commercial seat quota ENFORCE.
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

const uniquePhone = (suffix: number): string => {
  const digits = randomUUID().replace(/\D/g, "").slice(0, 7);
  return `+54911${digits}${suffix}`;
};

describeDatabaseIntegration("commercial seat quota concurrency", () => {
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

  const prepareEnforceCompany = async (seatMax: number) => {
    const suffix = randomUUID().slice(0, 8);
    const fixture = await createPlatformCompanyFixture({
      name: `Seat Quota Co ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: {
        name: "Seat Owner",
        email: `seat-quota-${suffix}@test.local`,
      },
    });
    const companyId = fixture.data.company.id;
    fixtures.trackCompany(companyId);

    await companySettingsRepository.updateCommercialSeatQuotaMode(companyId, "ENFORCE");

    const plan = await billingCatalogService.createPlan({
      planCode: `SQ_${suffix}`,
      displayName: "Seat test plan",
      planKind: "CUSTOM",
    });
    const subscription = await billingSubscriptionService.createAdminSubscription({
      companyId,
      billingPlanId: plan.id,
      subscriptionStatus: "ACTIVE",
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      initialTerms: {
        agreedAmount: "100",
        currency: "USD",
        billingPeriod: "MONTHLY",
        seatMin: 1,
        seatMax,
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      },
    });

    return { companyId, subscriptionId: subscription.id };
  };

  const countActive = async (companyId: string): Promise<number> => {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT COUNT(*) AS c
        FROM dbo.employees
        WHERE company_id = @companyId AND active = 1
      `);
    return Number(result.recordset[0]?.c ?? 0);
  };

  it("allows exactly one of two concurrent creates when one seat remains", async () => {
    const { companyId } = await prepareEnforceCompany(1);
    assert.equal(await countActive(companyId), 0);

    const results = await Promise.allSettled([
      employeeService.create(companyId, {
        name: "Concurrent A",
        phoneNumber: uniquePhone(1),
        employeeType: "fijo",
      }),
      employeeService.create(companyId, {
        name: "Concurrent B",
        phoneNumber: uniquePhone(2),
        employeeType: "fijo",
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    assert.equal(fulfilled.length, 1, "expected exactly one success");
    assert.equal(rejected.length, 1, "expected exactly one rejection");
    const failure = rejected[0] as PromiseRejectedResult;
    assert.ok(failure.reason instanceof AppError);
    assert.equal((failure.reason as AppError).code, "COMMERCIAL_SEAT_LIMIT_EXCEEDED");
    assert.equal(await countActive(companyId), 1);
  });
});