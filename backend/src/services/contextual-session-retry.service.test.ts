import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import type { BotSession } from "../types/twilio.types";
import { botSessionService } from "./bot-session.service";
import { recordInvalidContextualInput } from "./contextual-session-retry.service";

const session: BotSession = {
  id: "11111111-1111-4111-8111-111111111111",
  companyId: "22222222-2222-4222-8222-222222222222",
  employeeId: "33333333-3333-4333-8333-333333333333",
  operationId: null,
  employeeWorkdayId: null,
  attendanceRecordId: null,
  phoneNumber: "+5491111111111",
  state: "WAITING_MENU_SELECTION",
  intent: "MENU",
  contextJson: JSON.stringify({ menuOptions: ["check_in"] }),
  failedAttempts: 0,
  sessionVersion: 1,
  lastMessageSid: null,
  expiresAt: "2099-01-01T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("contextual retry conflict classification", () => {
  afterEach(() => mock.restoreAll());

  for (const kind of ["completed", "cancelled", "expired"] as const) {
    it(`reports a concurrently ${kind} session without retrying`, async () => {
      let calls = 0;
      mock.method(botSessionService, "recordFailedAttempt", async () => {
        calls += 1;
        return { kind, session };
      });
      const result = await recordInvalidContextualInput({
        companyId: session.companyId,
        session,
        messageSid: "SM1",
        retryMessage: "retry",
      });
      assert.equal(result.kind, kind);
      assert.equal(calls, 1);
      assert.notEqual(result.message, "retry");
    });
  }
});
