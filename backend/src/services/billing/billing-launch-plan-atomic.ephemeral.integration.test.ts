/**
 * DIN-406 Fase 2A corrections — atomic launch plan seed rollback proofs.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { BILLING_LAUNCH_PLAN_CODE } from "../../constants/billing-launch-plan";
import { getPool } from "../../database/connection";
import { isDatabaseIntegrationEnabled } from "../../test-helpers/integration-test";
import {
  activateEphemeralBillingExemptionDatabase,
  createEphemeralBillingExemptionDatabase,
  destroyEphemeralBillingExemptionDatabase,
  type EphemeralBillingExemptionHandle,
} from "../../test-helpers/ephemeral-billing-exemption-database";
import {
  BillingLaunchPlanSeedInjectedFailure,
  seedBillingLaunchPlan,
} from "./billing-launch-plan.seed";

const ephemeralEnabled =
  isDatabaseIntegrationEnabled() && process.env.INTEGRATION_EPHEMERAL_BILLING_DDL_ALLOWED === "true";
const describeEphemeral = ephemeralEnabled ? describe : describe.skip;

const countPlans = async (): Promise<number> => {
  const result = await getPool().request().query(`SELECT COUNT(*) AS c FROM dbo.billing_plans`);
  return Number(result.recordset[0].c);
};

const countTiersForLaunch = async (): Promise<number> => {
  const result = await getPool().request().query(`
    SELECT COUNT(*) AS c
    FROM dbo.billing_plan_tiers t
    INNER JOIN dbo.billing_plans p ON p.id = t.billing_plan_id
    WHERE p.plan_code = N'${BILLING_LAUNCH_PLAN_CODE}'
  `);
  return Number(result.recordset[0].c);
};

describeEphemeral("billing launch plan atomic seed rollback", () => {
  let ephemeral: EphemeralBillingExemptionHandle;

  before(async () => {
    ephemeral = await createEphemeralBillingExemptionDatabase();
    await activateEphemeralBillingExemptionDatabase(ephemeral);
    assert.equal(await countPlans(), 0);
  });

  after(async () => {
    await destroyEphemeralBillingExemptionDatabase(ephemeral);
    assert.equal(ephemeral.evidence.destroyed, true);
  });

  it("rolls back plan insert when failure is injected after plan", async () => {
    await assert.rejects(
      () => seedBillingLaunchPlan({ testInjectFailureAfter: "plan" }),
      (error: unknown) => {
        assert.ok(error instanceof BillingLaunchPlanSeedInjectedFailure);
        return true;
      },
    );
    assert.equal(await countPlans(), 0);
    assert.equal(await countTiersForLaunch(), 0);
  });

  it("rolls back tier insert when failure is injected after tier", async () => {
    await assert.rejects(
      () => seedBillingLaunchPlan({ testInjectFailureAfter: "tier" }),
      (error: unknown) => {
        assert.ok(error instanceof BillingLaunchPlanSeedInjectedFailure);
        return true;
      },
    );
    assert.equal(await countPlans(), 0);
    assert.equal(await countTiersForLaunch(), 0);
  });

  it("commits complete seed when no failure is injected", async () => {
    const result = await seedBillingLaunchPlan({ strictInitialPrice: true });
    assert.equal(result.planInserted, true);
    assert.equal(result.tierInserted, true);
    assert.equal(result.priceInserted, true);
    assert.equal(await countPlans(), 1);
    assert.equal(await countTiersForLaunch(), 1);
  });
});