import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveDayPeriod, resolveWeekPeriod } from "../utils/whatsapp-quota-periods";
import { resolveEffectiveQuotaMode } from "../services/whatsapp-usage-quota.service";
import { planWhatsAppTextDestination } from "../services/whatsapp-turn-destination.planner";

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
    const now = new Date("2026-09-14T15:30:00.000Z"); // Monday
    const week = resolveWeekPeriod(now, "America/Argentina/Buenos_Aires");
    assert.match(week.periodKey, /^2026-W\d{2}$/);
    assert.equal(week.kind, "WEEK");
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

describe("whatsapp turn destination planner", () => {
  it("plans arrival as CHECKIN without side effects", () => {
    const plan = planWhatsAppTextDestination({
      body: "Llegué",
      session: null,
      moduleStates: new Map(),
    });
    assert.equal(plan.resolvedIntent, "arrival");
    assert.equal(plan.resolvedHandler, "CHECKIN");
  });

  it("plans payroll as limited handler", () => {
    const plan = planWhatsAppTextDestination({
      body: "recibo",
      session: null,
      moduleStates: new Map(),
    });
    assert.equal(plan.resolvedHandler, "PAYROLL_RECEIPT_QUERY");
  });
});
