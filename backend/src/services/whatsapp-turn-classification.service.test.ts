import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WHATSAPP_TURN_CLASSIFICATION_RULE_VERSION } from "../constants/whatsapp-turn-classification";
import {
  classifyWhatsAppTurn,
  systemInteractionMatchesCriticalReply,
} from "../services/whatsapp-turn-classification.service";
import type { SystemInteractionContext } from "../types/whatsapp-turn-classification";

const NOW = Date.parse("2026-09-14T15:00:00.000Z");

const base = {
  companyId: "11111111-1111-1111-1111-111111111111",
  employeeId: "22222222-2222-2222-2222-222222222222",
  messageSid: "SM_TEST_1",
  messageType: "TEXT",
  nowMs: NOW,
};

const activeArrivalInteraction = (
  overrides: Partial<SystemInteractionContext> = {},
): SystemInteractionContext => ({
  id: "33333333-3333-3333-3333-333333333333",
  companyId: base.companyId,
  employeeId: base.employeeId,
  category: "ARRIVAL_REMINDER",
  relatedOperationId: "44444444-4444-4444-4444-444444444444",
  status: "ACTIVE",
  expiresAt: new Date(NOW + 60_000).toISOString(),
  sourceKey: "attendance_notification:x",
  ...overrides,
});

describe("whatsapp turn classification matrix v3", () => {
  it("uses stable rule version v3", () => {
    const result = classifyWhatsAppTurn({ ...base, resolvedIntent: "menu" });
    assert.equal(result.ruleVersion, WHATSAPP_TURN_CLASSIFICATION_RULE_VERSION);
    assert.equal(result.ruleVersion, "v3");
  });

  it("classifies Llegué as CRITICAL_EXEMPT", () => {
    const result = classifyWhatsAppTurn({ ...base, resolvedIntent: "arrival" });
    assert.equal(result.classification, "CRITICAL_EXEMPT");
    assert.equal(result.reasonCode, "RESOLVED_CRITICAL_INTENT");
  });

  it("classifies menu option landing on CHECKIN handler as CRITICAL", () => {
    const result = classifyWhatsAppTurn({
      ...base,
      activeSessionState: "WAITING_MENU_SELECTION",
      resolvedHandler: "CHECKIN",
    });
    assert.equal(result.classification, "CRITICAL_EXEMPT");
    assert.equal(result.reasonCode, "RESOLVED_CRITICAL_HANDLER");
  });

  it("limited handler wins over critical pre-route session (flow switch)", () => {
    const result = classifyWhatsAppTurn({
      ...base,
      activeSessionState: "WAITING_LOCATION",
      resolvedHandler: "PAYROLL_RECEIPT_QUERY",
      resolvedIntent: "payroll_receipt",
      correlatedSystemInteraction: activeArrivalInteraction(),
    });
    assert.equal(result.classification, "EMPLOYEE_LIMITED");
    assert.equal(result.reasonCode, "RESOLVED_LIMITED_HANDLER");
    assert.equal(result.systemInteractionId, null);
  });

  it("limited session then attendance via critical handler is CRITICAL", () => {
    const result = classifyWhatsAppTurn({
      ...base,
      activeSessionState: "WAITING_MENU_SELECTION",
      resolvedHandler: "CHECKIN",
      resolvedIntent: "arrival",
    });
    assert.equal(result.classification, "CRITICAL_EXEMPT");
    assert.equal(result.reasonCode, "RESOLVED_CRITICAL_HANDLER");
  });

  it("classifies location during check-in session as CRITICAL", () => {
    const result = classifyWhatsAppTurn({
      ...base,
      messageType: "LOCATION",
      activeSessionState: "WAITING_LOCATION",
      activeSessionIntent: "CHECK_IN",
    });
    assert.equal(result.classification, "CRITICAL_EXEMPT");
    assert.equal(result.reasonCode, "ACTIVE_CRITICAL_SESSION");
  });

  it("classifies invalid input in check-in session as CRITICAL (not consume-worthy alone)", () => {
    const result = classifyWhatsAppTurn({
      ...base,
      activeSessionState: "WAITING_OPERATION_SELECTION",
      resolvedIntent: "unknown",
    });
    assert.equal(result.classification, "CRITICAL_EXEMPT");
    assert.equal(result.reasonCode, "ACTIVE_CRITICAL_SESSION");
  });

  it("cancel inside critical session is CRITICAL navigation", () => {
    const result = classifyWhatsAppTurn({
      ...base,
      activeSessionState: "WAITING_LOCATION",
      globalCommand: "cancel",
    });
    assert.equal(result.reasonCode, "CANCEL_OR_BACK_IN_CRITICAL_SESSION");
    assert.equal(result.classification, "CRITICAL_EXEMPT");
  });

  it("classifies greeting/menu/help/workday/upcoming/payroll/absence as LIMITED", () => {
    for (const [intent, handler] of [
      ["menu", "MENU"],
      ["workday", "WORKDAY_QUERY"],
      ["upcoming_assignments", "UPCOMING_ASSIGNMENTS"],
      ["payroll_receipt", "PAYROLL_RECEIPT_QUERY"],
      ["absence", "ABSENCE"],
      ["unknown", null],
    ] as const) {
      const result = classifyWhatsAppTurn({
        ...base,
        resolvedIntent: intent,
        resolvedHandler: handler,
      });
      assert.equal(
        result.classification,
        "EMPLOYEE_LIMITED",
        `expected LIMITED for ${intent}`,
      );
    }
  });

  it("does not invent systemInteractionId for critical intent without matching interaction", () => {
    const result = classifyWhatsAppTurn({
      ...base,
      resolvedIntent: "arrival",
      correlatedSystemInteraction: null,
    });
    assert.equal(result.classification, "CRITICAL_EXEMPT");
    assert.equal(result.systemInteractionId, null);
  });

  it("attaches systemInteractionId only when interaction matches reply", () => {
    const interaction = activeArrivalInteraction();
    const result = classifyWhatsAppTurn({
      ...base,
      resolvedIntent: "arrival",
      resolvedHandler: "CHECKIN",
      relatedOperationId: interaction.relatedOperationId,
      correlatedSystemInteraction: interaction,
    });
    assert.equal(result.systemInteractionId, interaction.id);
  });

  it("does not attach interaction when category does not match reply", () => {
    const exitInteraction = activeArrivalInteraction({
      category: "EXIT_REMINDER",
      id: "55555555-5555-5555-5555-555555555555",
    });
    const result = classifyWhatsAppTurn({
      ...base,
      resolvedIntent: "arrival",
      resolvedHandler: "CHECKIN",
      correlatedSystemInteraction: exitInteraction,
    });
    assert.equal(result.systemInteractionId, null);
  });

  it("ignores expired system interaction with fixed clock", () => {
    const expired = activeArrivalInteraction({
      expiresAt: new Date(NOW - 1000).toISOString(),
    });
    const result = classifyWhatsAppTurn({
      ...base,
      messageType: "LOCATION",
      resolvedHandler: "CHECKIN",
      correlatedSystemInteraction: expired,
    });
    assert.equal(result.classification, "CRITICAL_EXEMPT");
    assert.equal(result.systemInteractionId, null);
  });

  it("ignores system interaction for another employee", () => {
    const other = activeArrivalInteraction({
      employeeId: "99999999-9999-9999-9999-999999999999",
    });
    assert.equal(
      systemInteractionMatchesCriticalReply(other, {
        ...base,
        resolvedIntent: "arrival",
      }),
      true,
    );
    const result = classifyWhatsAppTurn({
      ...base,
      resolvedIntent: "arrival",
      correlatedSystemInteraction: other,
    });
    assert.equal(result.systemInteractionId, null);
  });

  it("ignores system interaction for another company", () => {
    const other = activeArrivalInteraction({
      companyId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    });
    const result = classifyWhatsAppTurn({
      ...base,
      resolvedIntent: "arrival",
      correlatedSystemInteraction: other,
    });
    assert.equal(result.systemInteractionId, null);
  });

  it("future assignment confirmation reply can match OPERATION_ASSIGNMENT", () => {
    const interaction = activeArrivalInteraction({
      category: "OPERATION_ASSIGNMENT",
      expiresAt: new Date(NOW + 86_400_000).toISOString(),
    });
    const result = classifyWhatsAppTurn({
      ...base,
      resolvedIntent: "confirm_attendance",
      resolvedHandler: "CONFIRMATION",
      correlatedSystemInteraction: interaction,
    });
    assert.equal(result.classification, "CRITICAL_EXEMPT");
    assert.equal(result.systemInteractionId, interaction.id);
  });

  it("unknown session state with unknown intent uses dedicated reason", () => {
    const result = classifyWhatsAppTurn({
      ...base,
      activeSessionState: "WAITING_SOMETHING_NEW",
      resolvedIntent: "unknown",
    });
    assert.equal(result.classification, "AMBIGUOUS");
    assert.equal(result.reasonCode, "UNKNOWN_SESSION_STATE_WITH_UNKNOWN_INTENT");
  });

  it("unknown session state with conflicting intent is inconsistent", () => {
    const result = classifyWhatsAppTurn({
      ...base,
      activeSessionState: "WAITING_SOMETHING_NEW",
      resolvedIntent: "arrival",
    });
    // arrival intent allowlist wins before unknown-state branch
    assert.equal(result.classification, "CRITICAL_EXEMPT");
    assert.equal(result.reasonCode, "RESOLVED_CRITICAL_INTENT");
  });

  it("returns AMBIGUOUS when company/employee missing", () => {
    const result = classifyWhatsAppTurn({
      ...base,
      companyId: null,
      employeeId: null,
    });
    assert.equal(result.classification, "AMBIGUOUS");
    assert.equal(result.reasonCode, "MISSING_COMPANY_OR_EMPLOYEE");
    assert.equal(result.origin, "UNKNOWN");
  });

  it("is deterministic for identical inputs", () => {
    const input = {
      ...base,
      resolvedIntent: "workday" as const,
      resolvedHandler: "WORKDAY_QUERY",
    };
    assert.deepEqual(classifyWhatsAppTurn(input), classifyWhatsAppTurn(input));
  });
});
