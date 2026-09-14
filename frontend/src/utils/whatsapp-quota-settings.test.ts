import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  effectiveModeReasonLabel,
  modeDescription,
  toWhatsAppQuotaFormValues,
  validateWhatsAppQuotaForm,
  whatsappQuotaFormEqual,
} from "./whatsapp-quota-settings";
import type { WhatsAppQuotaSettings } from "../types/whatsapp-quota-settings";

const sample = (): WhatsAppQuotaSettings => ({
  companyId: "c1",
  globalMode: "OFF",
  companyMode: "SHADOW",
  effectiveMode: "OFF",
  effectiveModeReason: "GLOBAL_MODE_OFF",
  timezoneId: "America/Argentina/Buenos_Aires",
  dailyTurns: 20,
  weeklyTurns: 60,
  burstTurns: 5,
  burstWindowSeconds: 60,
  dailyOutbounds: 40,
  weeklyOutbounds: 120,
  companyDailyOutbounds: 500,
  limitNoticeEnabled: true,
  updatedAt: "2026-09-14T12:00:00.000Z",
  updatedBy: null,
  limits: {
    maxDailyTurns: 10000,
    maxWeeklyTurns: 50000,
    maxBurstTurns: 1000,
    minBurstWindowSeconds: 1,
    maxBurstWindowSeconds: 3600,
    maxDailyOutbounds: 20000,
    maxWeeklyOutbounds: 100000,
    maxCompanyDailyOutbounds: 500000,
  },
  shadowSummary: null,
});

describe("whatsapp quota settings utils", () => {
  it("maps settings to form and detects equality", () => {
    const form = toWhatsAppQuotaFormValues(sample());
    assert.equal(form.companyMode, "SHADOW");
    assert.equal(whatsappQuotaFormEqual(form, form), true);
    assert.equal(whatsappQuotaFormEqual(form, { ...form, dailyTurns: 21 }), false);
  });

  it("validates daily/weekly and zero", () => {
    const limits = sample().limits;
    assert.deepEqual(
      validateWhatsAppQuotaForm(toWhatsAppQuotaFormValues(sample()), limits),
      [],
    );
    const bad = validateWhatsAppQuotaForm(
      { ...toWhatsAppQuotaFormValues(sample()), dailyTurns: 80, weeklyTurns: 60 },
      limits,
    );
    assert.ok(bad.some((e) => e.includes("diarios")));
    assert.deepEqual(
      validateWhatsAppQuotaForm(
        {
          ...toWhatsAppQuotaFormValues(sample()),
          dailyTurns: 0,
          weeklyTurns: 0,
          burstTurns: 0,
          dailyOutbounds: 0,
          weeklyOutbounds: 0,
          companyDailyOutbounds: 0,
        },
        limits,
      ),
      [],
    );
  });

  it("exposes Spanish mode copy", () => {
    assert.match(modeDescription("ENFORCE"), /asistencia/);
    assert.match(effectiveModeReasonLabel("GLOBAL_MODE_OFF"), /global/);
  });
});
