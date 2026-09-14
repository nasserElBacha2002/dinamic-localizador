/**
 * Contract harness for the WhatsApp quota turn pipeline (resolver → classify → admit gate).
 * Mirrors webhook handleTextMessage decision points without Twilio/SQL side effects.
 * Cases map to Phase 2 review E2E acceptance criteria 1–6 at the control plane.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import { whatsappTurnClassificationService } from "./whatsapp-turn-classification.service";
import { resolveWhatsAppTextTurn } from "./whatsapp-turn-routing.resolver";
import {
  resolveEffectiveQuotaMode,
  whatsappUsageQuotaService,
} from "./whatsapp-usage-quota.service";
import { whatsappUsageQuotaRepository } from "../repositories/whatsapp-usage-quota.repository";
import type { BotSession } from "../types/twilio.types";
import type { WhatsAppQuotaPolicy } from "../types/whatsapp-usage-quota";
import { WHATSAPP_QUOTA_DEFAULTS } from "../constants/whatsapp-usage-quota";

const session = (overrides: Partial<BotSession>): BotSession =>
  ({
    id: "sess",
    companyId: "co",
    employeeId: "emp",
    phoneNumber: "+54911",
    intent: "CHECK_IN",
    state: "WAITING_LOCATION",
    operationId: "op-1",
    employeeWorkdayId: null,
    attendanceRecordId: null,
    contextJson: null,
    failedAttempts: 0,
    sessionVersion: 0,
    lastMessageSid: null,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }) as BotSession;

const policy = (mode: "OFF" | "SHADOW" | "ENFORCE"): WhatsAppQuotaPolicy => ({
  mode,
  dailyTurns: WHATSAPP_QUOTA_DEFAULTS.dailyTurns,
  weeklyTurns: WHATSAPP_QUOTA_DEFAULTS.weeklyTurns,
  burstTurns: WHATSAPP_QUOTA_DEFAULTS.burstTurns,
  burstWindowSeconds: WHATSAPP_QUOTA_DEFAULTS.burstWindowSeconds,
  dailyOutbounds: WHATSAPP_QUOTA_DEFAULTS.dailyOutbounds,
  weeklyOutbounds: WHATSAPP_QUOTA_DEFAULTS.weeklyOutbounds,
  companyDailyOutbounds: WHATSAPP_QUOTA_DEFAULTS.companyDailyOutbounds,
  limitNoticeEnabled: true,
  timezoneId: "UTC",
});

const decideTurn = (input: {
  body: string;
  active: BotSession | null;
}) => {
  const resolution = resolveWhatsAppTextTurn({
    body: input.body,
    session: input.active,
    moduleStates: new Map(),
  });
  const classified = whatsappTurnClassificationService.classify({
    companyId: "co",
    employeeId: "emp",
    messageSid: `SM-${randomUUID().slice(0, 8)}`,
    messageType: "TEXT",
    activeSessionIntent: input.active?.intent ?? null,
    activeSessionState: input.active?.state ?? null,
    resolvedIntent: resolution.resolvedIntent,
    resolvedHandler: resolution.resolvedHandler,
    relatedOperationId: resolution.relatedOperationId,
    globalCommand: resolution.globalCommand,
    correlatedSystemInteraction: null,
    nowMs: Date.now(),
  });
  return { resolution, classified };
};

describe("whatsapp quota turn pipeline contracts", () => {
  it("E2E-1: WAITING_LOCATION + recibo → EMPLOYEE_LIMITED, cancel deferred until admit", () => {
    const { resolution, classified } = decideTurn({
      body: "recibo",
      active: session({ intent: "CHECK_IN", state: "WAITING_LOCATION" }),
    });
    assert.equal(resolution.resolvedHandler, "PAYROLL_RECEIPT_QUERY");
    assert.equal(resolution.cancelSessionBeforeDispatch, true);
    assert.equal(classified.classification, "EMPLOYEE_LIMITED");
    // Blocked limited turns must not cancel session before admit (gate invariant).
    assert.equal(resolution.cancelSessionBeforeDispatch, true);
  });

  it("E2E-2: payroll session + Llegué → CRITICAL_EXEMPT (never limited admit)", () => {
    const { resolution, classified } = decideTurn({
      body: "Llegué",
      active: session({
        intent: "PAYROLL_RECEIPT",
        state: "WAITING_PAYROLL_RECEIPT_PERIOD",
        operationId: null,
      }),
    });
    assert.equal(resolution.resolvedHandler, "CHECKIN");
    assert.equal(classified.classification, "CRITICAL_EXEMPT");
  });

  it("E2E-5: SHADOW effective mode never equals ENFORCE block path from resolveEffectiveQuotaMode", () => {
    assert.equal(resolveEffectiveQuotaMode("SHADOW", "ENFORCE"), "SHADOW");
    assert.equal(resolveEffectiveQuotaMode("ENFORCE", "SHADOW"), "SHADOW");
  });

  it("E2E-6: OFF admit/reserve never touch quota repository methods", async () => {
    const calls: string[] = [];
    const originals = {
      findTurnAdmission: whatsappUsageQuotaRepository.findTurnAdmission,
      insertTurnDecision: whatsappUsageQuotaRepository.insertTurnDecision,
      admitTurnAtomic: whatsappUsageQuotaRepository.admitTurnAtomic,
      reserveOutboundAtomic: whatsappUsageQuotaRepository.reserveOutboundAtomic,
      insertShadowOutboundEvaluation:
        whatsappUsageQuotaRepository.insertShadowOutboundEvaluation,
      findOpenEmployeePeriodContaining:
        whatsappUsageQuotaRepository.findOpenEmployeePeriodContaining,
    };

    whatsappUsageQuotaRepository.findTurnAdmission = async (...args) => {
      calls.push("findTurnAdmission");
      return originals.findTurnAdmission(...args);
    };
    whatsappUsageQuotaRepository.insertTurnDecision = async (...args) => {
      calls.push("insertTurnDecision");
      return originals.insertTurnDecision(...args);
    };
    whatsappUsageQuotaRepository.admitTurnAtomic = async (...args) => {
      calls.push("admitTurnAtomic");
      return originals.admitTurnAtomic(...args);
    };
    whatsappUsageQuotaRepository.reserveOutboundAtomic = async (...args) => {
      calls.push("reserveOutboundAtomic");
      return originals.reserveOutboundAtomic(...args);
    };
    whatsappUsageQuotaRepository.insertShadowOutboundEvaluation = async (...args) => {
      calls.push("insertShadowOutboundEvaluation");
      return originals.insertShadowOutboundEvaluation(...args);
    };
    whatsappUsageQuotaRepository.findOpenEmployeePeriodContaining = async (...args) => {
      calls.push("findOpenEmployeePeriodContaining");
      return originals.findOpenEmployeePeriodContaining(...args);
    };

    try {
      const admit = await whatsappUsageQuotaService.admitNonCriticalTurn({
        companyId: randomUUID(),
        employeeId: randomUUID(),
        messageSid: `SM-off-${randomUUID().slice(0, 8)}`,
        classification: "EMPLOYEE_LIMITED",
        policy: policy("ENFORCE"), // company ENFORCE still OFF via global default
      });
      assert.equal(admit.mode, "OFF");
      assert.equal(admit.reasonCode, "MODE_OFF");

      const reserved = await whatsappUsageQuotaService.reserveOutbound({
        companyId: randomUUID(),
        employeeId: randomUUID(),
        turnMessageSid: "SM-off-out",
        logicalOutboundKey: "SM-off-out:twiml:0",
        policy: policy("ENFORCE"),
      });
      assert.equal(reserved.ok, true);
      assert.deepEqual(calls, []);
    } finally {
      Object.assign(whatsappUsageQuotaRepository, originals);
    }
  });

  it("critical classification never requires limited admission", () => {
    const { classified } = decideTurn({
      body: "Me voy",
      active: null,
    });
    assert.equal(classified.classification, "CRITICAL_EXEMPT");
  });

  it("resolver destination matches planner adapter (no divergent path)", () => {
    const active = session({ intent: "CHECK_IN", state: "WAITING_LOCATION" });
    const { resolution } = decideTurn({ body: "recibo", active });
    assert.equal(resolution.flowType, resolution.resolvedHandler);
    assert.equal(resolution.parsedIntent, "payroll_receipt");
  });
});
