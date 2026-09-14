import assert from "node:assert/strict";
import { after, before, it } from "node:test";
import { randomUUID } from "node:crypto";
import sql from "mssql";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { getPool } from "../database/connection";
import { whatsappUsageQuotaRepository } from "../repositories/whatsapp-usage-quota.repository";
import { resolveDayPeriod, resolveWeekPeriod } from "../utils/whatsapp-quota-periods";

describeDatabaseIntegration("whatsapp usage quota SQL concurrency", () => {
  before(async () => {
    await setupDatabaseIntegration();
  });

  after(async () => {
    await teardownDatabaseIntegration();
  });

  it("two connections dispute the last daily turn unit", async () => {
    const companyId = randomUUID();
    const employeeId = randomUUID();
    const now = new Date();
    const day = resolveDayPeriod(now, "UTC");
    const week = resolveWeekPeriod(now, "UTC");

    const seed = await whatsappUsageQuotaRepository.admitTurnAtomic({
      companyId,
      employeeId,
      messageSid: `SM-seed-${randomUUID().slice(0, 8)}`,
      classification: "EMPLOYEE_LIMITED",
      mode: "ENFORCE",
      day: {
        companyId,
        employeeId,
        window: day,
        turnLimit: 1,
        outboundLimit: 40,
      },
      week: {
        companyId,
        employeeId,
        window: week,
        turnLimit: 60,
        outboundLimit: 120,
      },
      burstTurns: 5,
      burstWindowSeconds: 60,
      now,
    });
    assert.equal(seed.ok, true);

    const results = await Promise.all([
      whatsappUsageQuotaRepository.admitTurnAtomic({
        companyId,
        employeeId,
        messageSid: `SM-a-${randomUUID().slice(0, 8)}`,
        classification: "EMPLOYEE_LIMITED",
        mode: "ENFORCE",
        day: {
          companyId,
          employeeId,
          window: day,
          turnLimit: 1,
          outboundLimit: 40,
        },
        week: {
          companyId,
          employeeId,
          window: week,
          turnLimit: 60,
          outboundLimit: 120,
        },
        burstTurns: 5,
        burstWindowSeconds: 60,
        now: new Date(),
      }),
      whatsappUsageQuotaRepository.admitTurnAtomic({
        companyId,
        employeeId,
        messageSid: `SM-b-${randomUUID().slice(0, 8)}`,
        classification: "EMPLOYEE_LIMITED",
        mode: "ENFORCE",
        day: {
          companyId,
          employeeId,
          window: day,
          turnLimit: 1,
          outboundLimit: 40,
        },
        week: {
          companyId,
          employeeId,
          window: week,
          turnLimit: 60,
          outboundLimit: 120,
        },
        burstTurns: 5,
        burstWindowSeconds: 60,
        now: new Date(),
      }),
    ]);

    const admitted = results.filter((r) => r.ok).length;
    const rejected = results.filter((r) => !r.ok).length;
    assert.equal(admitted, 0, "daily limit already exhausted by seed");
    assert.equal(rejected, 2);

    const usage = await whatsappUsageQuotaRepository.getEmployeePeriodUsage({
      companyId,
      employeeId,
      periodKind: "DAY",
      periodKey: day.periodKey,
    });
    assert.ok(usage);
    assert.ok(usage!.turnsUsed <= usage!.turnLimit);

    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        DELETE FROM dbo.whatsapp_quota_turn_admissions WHERE company_id = @companyId;
        DELETE FROM dbo.whatsapp_quota_employee_periods WHERE company_id = @companyId;
      `);
  });
});
