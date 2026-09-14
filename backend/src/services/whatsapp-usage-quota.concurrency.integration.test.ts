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

  it("SHADOW admissions do not inflate ENFORCE burst window", async () => {
    const companyId = randomUUID();
    const employeeId = randomUUID();
    const now = new Date();
    const day = resolveDayPeriod(now, "UTC");
    const week = resolveWeekPeriod(now, "UTC");

    for (let i = 0; i < 5; i += 1) {
      await whatsappUsageQuotaRepository.insertTurnDecision({
        companyId,
        employeeId,
        messageSid: `SM-shadow-${i}-${randomUUID().slice(0, 6)}`,
        decision: "SHADOW_WOULD_ADMIT",
        reasonCode: "ADMITTED",
        classification: "EMPLOYEE_LIMITED",
        mode: "SHADOW",
        admittedAt: now,
      });
    }

    const enforce = await whatsappUsageQuotaRepository.admitTurnAtomic({
      companyId,
      employeeId,
      messageSid: `SM-enforce-${randomUUID().slice(0, 8)}`,
      classification: "EMPLOYEE_LIMITED",
      mode: "ENFORCE",
      day: {
        companyId,
        employeeId,
        window: day,
        turnLimit: 20,
        outboundLimit: 40,
      },
      week: {
        companyId,
        employeeId,
        window: week,
        turnLimit: 60,
        outboundLimit: 120,
      },
      burstTurns: 1,
      burstWindowSeconds: 60,
      now,
    });
    assert.equal(enforce.ok, true, "SHADOW rows must not consume burst ENFORCE capacity");

    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        DELETE FROM dbo.whatsapp_quota_turn_admissions WHERE company_id = @companyId;
        DELETE FROM dbo.whatsapp_quota_employee_periods WHERE company_id = @companyId;
      `);
  });

  it("two connections dispute the last burst unit", async () => {
    const companyId = randomUUID();
    const employeeId = randomUUID();
    const now = new Date();
    const day = resolveDayPeriod(now, "UTC");
    const week = resolveWeekPeriod(now, "UTC");

    const seed = await whatsappUsageQuotaRepository.admitTurnAtomic({
      companyId,
      employeeId,
      messageSid: `SM-burst-seed-${randomUUID().slice(0, 8)}`,
      classification: "EMPLOYEE_LIMITED",
      mode: "ENFORCE",
      day: {
        companyId,
        employeeId,
        window: day,
        turnLimit: 20,
        outboundLimit: 40,
      },
      week: {
        companyId,
        employeeId,
        window: week,
        turnLimit: 60,
        outboundLimit: 120,
      },
      burstTurns: 1,
      burstWindowSeconds: 60,
      now,
    });
    assert.equal(seed.ok, true);

    const results = await Promise.all([
      whatsappUsageQuotaRepository.admitTurnAtomic({
        companyId,
        employeeId,
        messageSid: `SM-burst-a-${randomUUID().slice(0, 8)}`,
        classification: "EMPLOYEE_LIMITED",
        mode: "ENFORCE",
        day: {
          companyId,
          employeeId,
          window: day,
          turnLimit: 20,
          outboundLimit: 40,
        },
        week: {
          companyId,
          employeeId,
          window: week,
          turnLimit: 60,
          outboundLimit: 120,
        },
        burstTurns: 1,
        burstWindowSeconds: 60,
        now: new Date(),
      }),
      whatsappUsageQuotaRepository.admitTurnAtomic({
        companyId,
        employeeId,
        messageSid: `SM-burst-b-${randomUUID().slice(0, 8)}`,
        classification: "EMPLOYEE_LIMITED",
        mode: "ENFORCE",
        day: {
          companyId,
          employeeId,
          window: day,
          turnLimit: 20,
          outboundLimit: 40,
        },
        week: {
          companyId,
          employeeId,
          window: week,
          turnLimit: 60,
          outboundLimit: 120,
        },
        burstTurns: 1,
        burstWindowSeconds: 60,
        now: new Date(),
      }),
    ]);

    const admitted = results.filter((r) => r.ok).length;
    const rejected = results.filter((r) => !r.ok && r.reasonCode === "BLOCKED_BURST").length;
    assert.equal(admitted, 0);
    assert.equal(rejected, 2);

    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        DELETE FROM dbo.whatsapp_quota_turn_admissions WHERE company_id = @companyId;
        DELETE FROM dbo.whatsapp_quota_employee_periods WHERE company_id = @companyId;
      `);
  });

  it("two connections dispute the last weekly turn unit", async () => {
    const companyId = randomUUID();
    const employeeId = randomUUID();
    const now = new Date();
    const day = resolveDayPeriod(now, "UTC");
    const week = resolveWeekPeriod(now, "UTC");

    const seed = await whatsappUsageQuotaRepository.admitTurnAtomic({
      companyId,
      employeeId,
      messageSid: `SM-wseed-${randomUUID().slice(0, 8)}`,
      classification: "EMPLOYEE_LIMITED",
      mode: "ENFORCE",
      day: {
        companyId,
        employeeId,
        window: day,
        turnLimit: 20,
        outboundLimit: 40,
      },
      week: {
        companyId,
        employeeId,
        window: week,
        turnLimit: 1,
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
        messageSid: `SM-wa-${randomUUID().slice(0, 8)}`,
        classification: "EMPLOYEE_LIMITED",
        mode: "ENFORCE",
        day: {
          companyId,
          employeeId,
          window: day,
          turnLimit: 20,
          outboundLimit: 40,
        },
        week: {
          companyId,
          employeeId,
          window: week,
          turnLimit: 1,
          outboundLimit: 120,
        },
        burstTurns: 5,
        burstWindowSeconds: 60,
        now: new Date(),
      }),
      whatsappUsageQuotaRepository.admitTurnAtomic({
        companyId,
        employeeId,
        messageSid: `SM-wb-${randomUUID().slice(0, 8)}`,
        classification: "EMPLOYEE_LIMITED",
        mode: "ENFORCE",
        day: {
          companyId,
          employeeId,
          window: day,
          turnLimit: 20,
          outboundLimit: 40,
        },
        week: {
          companyId,
          employeeId,
          window: week,
          turnLimit: 1,
          outboundLimit: 120,
        },
        burstTurns: 5,
        burstWindowSeconds: 60,
        now: new Date(),
      }),
    ]);

    const ok = results.filter((r) => r.ok).length;
    const blocked = results.filter(
      (r) => !r.ok && r.reasonCode === "BLOCKED_WEEKLY_TURNS",
    ).length;
    assert.equal(ok, 0);
    assert.equal(blocked, 2);

    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        DELETE FROM dbo.whatsapp_quota_turn_admissions WHERE company_id = @companyId;
        DELETE FROM dbo.whatsapp_quota_employee_periods WHERE company_id = @companyId;
      `);
  });

  it("duplicate MessageSid does not double-consume daily turns", async () => {
    const companyId = randomUUID();
    const employeeId = randomUUID();
    const now = new Date();
    const day = resolveDayPeriod(now, "UTC");
    const week = resolveWeekPeriod(now, "UTC");
    const messageSid = `SM-dup-${randomUUID().slice(0, 8)}`;

    const first = await whatsappUsageQuotaRepository.admitTurnAtomic({
      companyId,
      employeeId,
      messageSid,
      classification: "EMPLOYEE_LIMITED",
      mode: "ENFORCE",
      day: {
        companyId,
        employeeId,
        window: day,
        turnLimit: 5,
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
    assert.equal(first.ok, true);

    const second = await whatsappUsageQuotaRepository.admitTurnAtomic({
      companyId,
      employeeId,
      messageSid,
      classification: "EMPLOYEE_LIMITED",
      mode: "ENFORCE",
      day: {
        companyId,
        employeeId,
        window: day,
        turnLimit: 5,
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
    });
    assert.equal(second.ok, false);
    assert.equal(second.reasonCode, "DUPLICATE");

    const usage = await whatsappUsageQuotaRepository.getEmployeePeriodUsage({
      companyId,
      employeeId,
      periodKind: "DAY",
      periodKey: day.periodKey,
    });
    assert.equal(usage?.turnsUsed, 1);

    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        DELETE FROM dbo.whatsapp_quota_turn_admissions WHERE company_id = @companyId;
        DELETE FROM dbo.whatsapp_quota_employee_periods WHERE company_id = @companyId;
      `);
  });

  it("two employees dispute the last company daily outbound unit", async () => {
    const companyId = randomUUID();
    const employeeA = randomUUID();
    const employeeB = randomUUID();
    const now = new Date();
    const day = resolveDayPeriod(now, "UTC");
    const week = resolveWeekPeriod(now, "UTC");

    const seed = await whatsappUsageQuotaRepository.reserveOutboundAtomic({
      companyId,
      employeeId: employeeA,
      turnMessageSid: `SM-co-seed-${randomUUID().slice(0, 8)}`,
      logicalOutboundKey: `key-seed-${randomUUID().slice(0, 8)}`,
      mode: "ENFORCE",
      day: {
        companyId,
        employeeId: employeeA,
        window: day,
        turnLimit: 20,
        outboundLimit: 40,
      },
      week: {
        companyId,
        employeeId: employeeA,
        window: week,
        turnLimit: 60,
        outboundLimit: 120,
      },
      companyDay: { companyId, window: day, outboundLimit: 1 },
    });
    assert.equal(seed.ok, true);

    const results = await Promise.all([
      whatsappUsageQuotaRepository.reserveOutboundAtomic({
        companyId,
        employeeId: employeeA,
        turnMessageSid: `SM-co-a-${randomUUID().slice(0, 8)}`,
        logicalOutboundKey: `key-a-${randomUUID().slice(0, 8)}`,
        mode: "ENFORCE",
        day: {
          companyId,
          employeeId: employeeA,
          window: day,
          turnLimit: 20,
          outboundLimit: 40,
        },
        week: {
          companyId,
          employeeId: employeeA,
          window: week,
          turnLimit: 60,
          outboundLimit: 120,
        },
        companyDay: { companyId, window: day, outboundLimit: 1 },
      }),
      whatsappUsageQuotaRepository.reserveOutboundAtomic({
        companyId,
        employeeId: employeeB,
        turnMessageSid: `SM-co-b-${randomUUID().slice(0, 8)}`,
        logicalOutboundKey: `key-b-${randomUUID().slice(0, 8)}`,
        mode: "ENFORCE",
        day: {
          companyId,
          employeeId: employeeB,
          window: day,
          turnLimit: 20,
          outboundLimit: 40,
        },
        week: {
          companyId,
          employeeId: employeeB,
          window: week,
          turnLimit: 60,
          outboundLimit: 120,
        },
        companyDay: { companyId, window: day, outboundLimit: 1 },
      }),
    ]);

    const ok = results.filter((r) => r.ok).length;
    const blocked = results.filter(
      (r) => !r.ok && r.reasonCode === "BLOCKED_COMPANY_DAILY_OUTBOUNDS",
    ).length;
    assert.equal(ok, 0);
    assert.equal(blocked, 2);

    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        DELETE FROM dbo.whatsapp_quota_outbound_reservations WHERE company_id = @companyId;
        DELETE FROM dbo.whatsapp_quota_employee_periods WHERE company_id = @companyId;
        DELETE FROM dbo.whatsapp_quota_company_periods WHERE company_id = @companyId;
      `);
  });

  it("duplicate logical outbound key reuses reservation", async () => {
    const companyId = randomUUID();
    const employeeId = randomUUID();
    const now = new Date();
    const day = resolveDayPeriod(now, "UTC");
    const week = resolveWeekPeriod(now, "UTC");
    const logicalKey = `logical-${randomUUID().slice(0, 8)}`;

    const first = await whatsappUsageQuotaRepository.reserveOutboundAtomic({
      companyId,
      employeeId,
      turnMessageSid: `SM-out-1-${randomUUID().slice(0, 8)}`,
      logicalOutboundKey: logicalKey,
      mode: "ENFORCE",
      day: {
        companyId,
        employeeId,
        window: day,
        turnLimit: 20,
        outboundLimit: 40,
      },
      week: {
        companyId,
        employeeId,
        window: week,
        turnLimit: 60,
        outboundLimit: 120,
      },
      companyDay: { companyId, window: day, outboundLimit: 500 },
    });
    assert.equal(first.ok, true);

    const second = await whatsappUsageQuotaRepository.reserveOutboundAtomic({
      companyId,
      employeeId,
      turnMessageSid: `SM-out-2-${randomUUID().slice(0, 8)}`,
      logicalOutboundKey: logicalKey,
      mode: "ENFORCE",
      day: {
        companyId,
        employeeId,
        window: day,
        turnLimit: 20,
        outboundLimit: 40,
      },
      week: {
        companyId,
        employeeId,
        window: week,
        turnLimit: 60,
        outboundLimit: 120,
      },
      companyDay: { companyId, window: day, outboundLimit: 500 },
    });
    assert.equal(second.ok, true);
    if (first.ok && second.ok) {
      assert.equal(second.reused, true);
      assert.equal(second.reservationId, first.reservationId);
    }

    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        DELETE FROM dbo.whatsapp_quota_outbound_reservations WHERE company_id = @companyId;
        DELETE FROM dbo.whatsapp_quota_employee_periods WHERE company_id = @companyId;
        DELETE FROM dbo.whatsapp_quota_company_periods WHERE company_id = @companyId;
      `);
  });
});
