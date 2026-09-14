import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { updateWhatsAppQuotaSettingsSchema } from "./whatsapp-quota-settings.schema";
import { explainEffectiveQuotaMode } from "../services/whatsapp-usage-quota.service";

describe("whatsapp quota settings schema", () => {
  const valid = {
    companyMode: "SHADOW" as const,
    dailyTurns: 20,
    weeklyTurns: 60,
    burstTurns: 5,
    burstWindowSeconds: 60,
    dailyOutbounds: 40,
    weeklyOutbounds: 120,
    companyDailyOutbounds: 500,
    limitNoticeEnabled: true,
  };

  it("accepts valid payload", () => {
    const parsed = updateWhatsAppQuotaSettingsSchema.parse(valid);
    assert.equal(parsed.companyMode, "SHADOW");
  });

  it("rejects unknown properties", () => {
    assert.throws(() =>
      updateWhatsAppQuotaSettingsSchema.parse({ ...valid, globalMode: "ENFORCE" }),
    );
  });

  it("rejects negative and non-integer values", () => {
    assert.throws(() =>
      updateWhatsAppQuotaSettingsSchema.parse({ ...valid, dailyTurns: -1 }),
    );
    assert.throws(() =>
      updateWhatsAppQuotaSettingsSchema.parse({ ...valid, dailyTurns: 1.5 }),
    );
  });

  it("allows zero as hard block", () => {
    const parsed = updateWhatsAppQuotaSettingsSchema.parse({
      ...valid,
      dailyTurns: 0,
      weeklyTurns: 0,
      burstTurns: 0,
      dailyOutbounds: 0,
      weeklyOutbounds: 0,
      companyDailyOutbounds: 0,
    });
    assert.equal(parsed.dailyTurns, 0);
  });

  it("enforces daily <= weekly and burst <= daily", () => {
    assert.throws(() =>
      updateWhatsAppQuotaSettingsSchema.parse({ ...valid, dailyTurns: 80, weeklyTurns: 60 }),
    );
    assert.throws(() =>
      updateWhatsAppQuotaSettingsSchema.parse({ ...valid, burstTurns: 25, dailyTurns: 20 }),
    );
  });

  it("requires company daily outbounds >= employee daily", () => {
    assert.throws(() =>
      updateWhatsAppQuotaSettingsSchema.parse({
        ...valid,
        dailyOutbounds: 50,
        companyDailyOutbounds: 40,
      }),
    );
  });
});

describe("explainEffectiveQuotaMode", () => {
  it("global OFF wins", () => {
    const r = explainEffectiveQuotaMode("OFF", "ENFORCE");
    assert.equal(r.effectiveMode, "OFF");
    assert.equal(r.effectiveModeReason, "GLOBAL_MODE_OFF");
  });

  it("company OFF wins when global not OFF", () => {
    const r = explainEffectiveQuotaMode("SHADOW", "OFF");
    assert.equal(r.effectiveMode, "OFF");
    assert.equal(r.effectiveModeReason, "COMPANY_MODE_OFF");
  });

  it("both ENFORCE", () => {
    const r = explainEffectiveQuotaMode("ENFORCE", "ENFORCE");
    assert.equal(r.effectiveMode, "ENFORCE");
    assert.equal(r.effectiveModeReason, "BOTH_ENFORCE");
  });

  it("shadow combination", () => {
    const r = explainEffectiveQuotaMode("ENFORCE", "SHADOW");
    assert.equal(r.effectiveMode, "SHADOW");
    assert.equal(r.effectiveModeReason, "SHADOW_COMBINATION");
  });
});
