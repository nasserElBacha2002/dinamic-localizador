import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import {
  preferOpenOrResolvePeriod,
  resolveDayPeriod,
  resolveWeekPeriod,
} from "../utils/whatsapp-quota-periods";
import {
  resolveEffectiveQuotaMode,
  whatsappUsageQuotaService,
} from "../services/whatsapp-usage-quota.service";
import { WHATSAPP_QUOTA_DEFAULTS } from "../constants/whatsapp-usage-quota";
import type { WhatsAppQuotaPolicy } from "../types/whatsapp-usage-quota";
import { env } from "../config/env";
import { whatsappUsageQuotaRepository } from "../repositories/whatsapp-usage-quota.repository";

const basePolicy = (overrides?: Partial<WhatsAppQuotaPolicy>): WhatsAppQuotaPolicy => ({
  mode: "ENFORCE",
  dailyTurns: WHATSAPP_QUOTA_DEFAULTS.dailyTurns,
  weeklyTurns: WHATSAPP_QUOTA_DEFAULTS.weeklyTurns,
  burstTurns: WHATSAPP_QUOTA_DEFAULTS.burstTurns,
  burstWindowSeconds: WHATSAPP_QUOTA_DEFAULTS.burstWindowSeconds,
  dailyOutbounds: WHATSAPP_QUOTA_DEFAULTS.dailyOutbounds,
  weeklyOutbounds: WHATSAPP_QUOTA_DEFAULTS.weeklyOutbounds,
  companyDailyOutbounds: WHATSAPP_QUOTA_DEFAULTS.companyDailyOutbounds,
  limitNoticeEnabled: true,
  timezoneId: "America/Argentina/Buenos_Aires",
  ...overrides,
});

describe("whatsapp quota periods", () => {
  it("resolves local day bounds in company timezone", () => {
    const now = new Date("2026-09-14T15:30:00.000Z");
    const day = resolveDayPeriod(now, "America/Argentina/Buenos_Aires");
    assert.equal(day.periodKey, "2026-09-14");
    assert.equal(day.kind, "DAY");
    assert.ok(day.periodStartUtc < now);
    assert.ok(day.periodEndUtc > now);
  });

  it("resolves ISO week starting Monday", () => {
    const now = new Date("2026-09-14T15:30:00.000Z");
    const week = resolveWeekPeriod(now, "America/Argentina/Buenos_Aires");
    assert.match(week.periodKey, /^2026-W\d{2}$/);
    assert.equal(week.kind, "WEEK");
  });

  it("preferOpen keeps Buenos Aires period when TZ switches to UTC near local midnight", () => {
    // 01:30 UTC = 22:30 previous calendar day in America/Argentina/Buenos_Aires (UTC-3).
    const now = new Date("2026-09-15T01:30:00.000Z");
    const ba = resolveDayPeriod(now, "America/Argentina/Buenos_Aires");
    assert.equal(ba.periodKey, "2026-09-14");
    const preferred = preferOpenOrResolvePeriod({
      kind: "DAY",
      nowUtc: now,
      timezoneId: "UTC",
      open: {
        periodKey: ba.periodKey,
        periodStartUtc: ba.periodStartUtc,
        periodEndUtc: ba.periodEndUtc,
        timezoneId: ba.timezoneId,
      },
    });
    assert.equal(preferred.periodKey, ba.periodKey);
    assert.equal(preferred.timezoneId, "America/Argentina/Buenos_Aires");
    const utcOnly = resolveDayPeriod(now, "UTC");
    assert.equal(utcOnly.periodKey, "2026-09-15");
    assert.notEqual(preferred.periodKey, utcOnly.periodKey);
  });

  it("preferOpen opens new window when open interval expired", () => {
    const now = new Date("2026-09-15T12:00:00.000Z");
    const preferred = preferOpenOrResolvePeriod({
      kind: "DAY",
      nowUtc: now,
      timezoneId: "UTC",
      open: {
        periodKey: "2026-09-14",
        periodStartUtc: new Date("2026-09-14T00:00:00.000Z"),
        periodEndUtc: new Date("2026-09-15T00:00:00.000Z"),
        timezoneId: "UTC",
      },
    });
    assert.equal(preferred.periodKey, "2026-09-15");
  });

  it("preferOpen keeps week across mid-week timezone change", () => {
    const now = new Date("2026-09-16T18:00:00.000Z"); // Wednesday
    const baWeek = resolveWeekPeriod(now, "America/Argentina/Buenos_Aires");
    const preferred = preferOpenOrResolvePeriod({
      kind: "WEEK",
      nowUtc: now,
      timezoneId: "UTC",
      open: {
        periodKey: baWeek.periodKey,
        periodStartUtc: baWeek.periodStartUtc,
        periodEndUtc: baWeek.periodEndUtc,
        timezoneId: baWeek.timezoneId,
      },
    });
    assert.equal(preferred.periodKey, baWeek.periodKey);
    assert.equal(preferred.timezoneId, "America/Argentina/Buenos_Aires");
  });

  it("preferOpen preserves New York DST spring-forward day window", () => {
    // 2026-03-08 07:30 UTC is still 2026-03-08 local before 2am→3am spring forward in America/New_York.
    const now = new Date("2026-03-08T07:30:00.000Z");
    const ny = resolveDayPeriod(now, "America/New_York");
    assert.equal(ny.periodKey, "2026-03-08");
    const preferred = preferOpenOrResolvePeriod({
      kind: "DAY",
      nowUtc: now,
      timezoneId: "UTC",
      open: {
        periodKey: ny.periodKey,
        periodStartUtc: ny.periodStartUtc,
        periodEndUtc: ny.periodEndUtc,
        timezoneId: ny.timezoneId,
      },
    });
    assert.equal(preferred.periodKey, "2026-03-08");
    assert.equal(preferred.periodStartUtc.toISOString(), ny.periodStartUtc.toISOString());
    assert.equal(preferred.periodEndUtc.toISOString(), ny.periodEndUtc.toISOString());
  });
});

describe("whatsapp quota effective mode", () => {
  it("global OFF wins", () => {
    assert.equal(resolveEffectiveQuotaMode("OFF", "ENFORCE"), "OFF");
  });

  it("requires both ENFORCE", () => {
    assert.equal(resolveEffectiveQuotaMode("ENFORCE", "ENFORCE"), "ENFORCE");
    assert.equal(resolveEffectiveQuotaMode("ENFORCE", "SHADOW"), "SHADOW");
    assert.equal(resolveEffectiveQuotaMode("SHADOW", "ENFORCE"), "SHADOW");
  });
});

describe("whatsapp quota OFF short-circuit", () => {
  it("admits without touching quota tables when effective mode is OFF", async () => {
    // Relies on WHATSAPP_QUOTA_GLOBAL_MODE=OFF (default). Passing company ENFORCE
    // still yields OFF — would throw if findTurnAdmission/insert ran without DB.
    const result = await whatsappUsageQuotaService.admitNonCriticalTurn({
      companyId: randomUUID(),
      employeeId: randomUUID(),
      messageSid: `SM-off-${randomUUID().slice(0, 8)}`,
      classification: "EMPLOYEE_LIMITED",
      policy: basePolicy({ mode: "ENFORCE" }),
    });
    assert.equal(result.decision, "ADMITTED");
    assert.equal(result.reasonCode, "MODE_OFF");
    assert.equal(result.mode, "OFF");
  });

  it("reserveOutbound OFF returns noop without quota tables", async () => {
    const result = await whatsappUsageQuotaService.reserveOutbound({
      companyId: randomUUID(),
      employeeId: randomUUID(),
      turnMessageSid: "SM-off-out",
      logicalOutboundKey: `SM-off-out:twiml:0`,
      policy: basePolicy({ mode: "ENFORCE" }),
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.ok(result.reservationId.startsWith("noop:"));
    }
  });
});

describe("whatsapp quota SHADOW outbound", () => {
  it("evaluates policy without reserveOutboundAtomic and never blocks", async () => {
    const originalMode = env.WHATSAPP_QUOTA_GLOBAL_MODE;
    env.WHATSAPP_QUOTA_GLOBAL_MODE = "SHADOW";

    let shadowInserts = 0;
    let enforceReserves = 0;
    const originals = {
      findOpenEmployeePeriodContaining:
        whatsappUsageQuotaRepository.findOpenEmployeePeriodContaining,
      findOpenCompanyPeriodContaining:
        whatsappUsageQuotaRepository.findOpenCompanyPeriodContaining,
      getEmployeePeriodUsage: whatsappUsageQuotaRepository.getEmployeePeriodUsage,
      insertShadowOutboundEvaluation:
        whatsappUsageQuotaRepository.insertShadowOutboundEvaluation,
      reserveOutboundAtomic: whatsappUsageQuotaRepository.reserveOutboundAtomic,
    };

    whatsappUsageQuotaRepository.findOpenEmployeePeriodContaining = async () => null;
    whatsappUsageQuotaRepository.findOpenCompanyPeriodContaining = async () => null;
    whatsappUsageQuotaRepository.getEmployeePeriodUsage = async () => null;
    whatsappUsageQuotaRepository.insertShadowOutboundEvaluation = async () => {
      shadowInserts += 1;
      return randomUUID();
    };
    whatsappUsageQuotaRepository.reserveOutboundAtomic = async () => {
      enforceReserves += 1;
      return { ok: true, reservationId: randomUUID(), reused: false };
    };

    try {
      const admit = await whatsappUsageQuotaService.reserveOutbound({
        companyId: randomUUID(),
        employeeId: randomUUID(),
        turnMessageSid: "SM-shadow-out",
        logicalOutboundKey: "SM-shadow-out:twiml:0",
        policy: basePolicy({ mode: "SHADOW" }),
      });
      assert.equal(admit.ok, true);
      if (admit.ok) {
        assert.equal(admit.status, "SHADOW_WOULD_ADMIT");
        assert.ok(admit.reservationId.startsWith("noop-shadow:"));
      }
      assert.equal(shadowInserts, 1);
      assert.equal(enforceReserves, 0);

      // Would-reject path still returns ok for callers (never blocks).
      whatsappUsageQuotaRepository.getEmployeePeriodUsage = async () => ({
        turnsUsed: 0,
        turnLimit: 20,
        outboundsUsed: 40,
        outboundLimit: 40,
        periodEndUtc: new Date("2099-01-01T00:00:00.000Z"),
      });
      const rejectish = await whatsappUsageQuotaService.reserveOutbound({
        companyId: randomUUID(),
        employeeId: randomUUID(),
        turnMessageSid: "SM-shadow-out-2",
        logicalOutboundKey: "SM-shadow-out-2:doc:0",
        policy: basePolicy({ mode: "SHADOW", dailyOutbounds: 40 }),
      });
      assert.equal(rejectish.ok, true);
      if (rejectish.ok) {
        assert.equal(rejectish.status, "SHADOW_WOULD_REJECT");
      }
      assert.equal(shadowInserts, 2);
      assert.equal(enforceReserves, 0);
    } finally {
      env.WHATSAPP_QUOTA_GLOBAL_MODE = originalMode;
      Object.assign(whatsappUsageQuotaRepository, originals);
    }
  });
});
