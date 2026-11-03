import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { whatsappTurnClassificationService } from "./whatsapp-turn-classification.service";
import {
  resolveWhatsAppTextTurn,
  planWhatsAppTextDestination,
} from "./whatsapp-turn-routing.resolver";
import type { BotSession } from "../../types/twilio.types";

const criticalSession = (overrides?: Partial<BotSession>): BotSession =>
  ({
    id: "sess-1",
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

const payrollSession = (): BotSession =>
  criticalSession({
    intent: "PAYROLL_RECEIPT",
    state: "WAITING_PAYROLL_RECEIPT_PERIOD",
    operationId: null,
  });

describe("whatsapp turn routing resolver (authoritative)", () => {
  it("explicit limited switch from critical session plans payroll and defers cancel", () => {
    const r = resolveWhatsAppTextTurn({
      body: "recibo",
      session: criticalSession(),
      moduleStates: new Map(),
    });
    assert.equal(r.resolvedHandler, "PAYROLL_RECEIPT_QUERY");
    assert.equal(r.resolvedIntent, "payroll_receipt");
    assert.equal(r.cancelSessionBeforeDispatch, true);
    assert.equal(r.continueActiveSession, false);

    const c = whatsappTurnClassificationService.classify({
      companyId: "co",
      employeeId: "emp",
      messageSid: "SM1",
      messageType: "TEXT",
      activeSessionIntent: "CHECK_IN",
      activeSessionState: "WAITING_LOCATION",
      resolvedIntent: r.resolvedIntent,
      resolvedHandler: r.resolvedHandler,
      relatedOperationId: r.relatedOperationId,
      globalCommand: r.globalCommand,
      correlatedSystemInteraction: null,
      nowMs: 1,
    });
    assert.equal(c.classification, "EMPLOYEE_LIMITED");
  });

  it("explicit critical switch from limited session plans CHECKIN (never quota-blocked)", () => {
    const r = resolveWhatsAppTextTurn({
      body: "Llegué",
      session: payrollSession(),
      moduleStates: new Map(),
    });
    assert.equal(r.resolvedHandler, "CHECKIN");
    assert.equal(r.resolvedIntent, "arrival");
    assert.equal(r.cancelSessionBeforeDispatch, true);

    const c = whatsappTurnClassificationService.classify({
      companyId: "co",
      employeeId: "emp",
      messageSid: "SM2",
      messageType: "TEXT",
      activeSessionIntent: "PAYROLL_RECEIPT",
      activeSessionState: "WAITING_PAYROLL_RECEIPT_PERIOD",
      resolvedIntent: r.resolvedIntent,
      resolvedHandler: r.resolvedHandler,
      relatedOperationId: r.relatedOperationId,
      globalCommand: r.globalCommand,
      correlatedSystemInteraction: null,
      nowMs: 1,
    });
    assert.equal(c.classification, "CRITICAL_EXEMPT");
  });

  it("invalid input in critical session stays continuation (critical)", () => {
    const r = resolveWhatsAppTextTurn({
      body: "asdfgh",
      session: criticalSession(),
      moduleStates: new Map(),
    });
    assert.equal(r.continueActiveSession, true);
    assert.equal(r.cancelSessionBeforeDispatch, false);
    assert.equal(r.resolvedHandler, null);

    const c = whatsappTurnClassificationService.classify({
      companyId: "co",
      employeeId: "emp",
      messageSid: "SM3",
      messageType: "TEXT",
      activeSessionIntent: "CHECK_IN",
      activeSessionState: "WAITING_LOCATION",
      resolvedIntent: r.resolvedIntent,
      resolvedHandler: r.resolvedHandler,
      relatedOperationId: r.relatedOperationId,
      globalCommand: r.globalCommand,
      correlatedSystemInteraction: null,
      nowMs: 1,
    });
    assert.equal(c.classification, "CRITICAL_EXEMPT");
  });

  it("planWhatsAppTextDestination matches resolve fields", () => {
    const session = criticalSession();
    const r = resolveWhatsAppTextTurn({
      body: "recibo",
      session,
      moduleStates: new Map(),
    });
    const p = planWhatsAppTextDestination({
      body: "recibo",
      session,
      moduleStates: new Map(),
    });
    assert.equal(p.resolvedHandler, r.resolvedHandler);
    assert.equal(p.resolvedIntent, r.resolvedIntent);
  });

  it("numeric selection in WAITING_ABSENCE_KIND_SELECTION continues absence flow", () => {
    const session = criticalSession({
      intent: "ABSENCE",
      state: "WAITING_ABSENCE_KIND_SELECTION",
      operationId: null,
      contextJson: JSON.stringify({
        flow: "ABSENCE_REQUEST",
        absenceKindOptions: ["single_workday", "absence", "vacation", "edit_request"],
      }),
    });
    const r = resolveWhatsAppTextTurn({
      body: "4",
      session,
      moduleStates: new Map([
        ["absences", true],
        ["operations", true],
      ] as const),
    });
    assert.equal(r.continueActiveSession, true);
    assert.equal(r.cancelSessionBeforeDispatch, false);
    assert.equal(r.resolvedHandler, "ABSENCE");
    assert.equal(r.resolvedIntent, "absence");
    assert.equal(r.flowType, "ABSENCE");

    const c = whatsappTurnClassificationService.classify({
      companyId: "co",
      employeeId: "emp",
      messageSid: "SM-edit-kind",
      messageType: "TEXT",
      activeSessionIntent: "ABSENCE",
      activeSessionState: "WAITING_ABSENCE_KIND_SELECTION",
      resolvedIntent: r.resolvedIntent,
      resolvedHandler: r.resolvedHandler,
      relatedOperationId: r.relatedOperationId,
      globalCommand: r.globalCommand,
      correlatedSystemInteraction: null,
      nowMs: 1,
    });
    assert.equal(c.classification, "EMPLOYEE_LIMITED");
  });
});
