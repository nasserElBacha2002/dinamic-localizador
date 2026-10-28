import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  inferHistoricalIntentFromState,
  isExplicitIntentCompatibleWithSession,
  isIntentStateCompatible,
} from "./bot-session-intent";
import { ACTIVE_BOT_SESSION_STATES } from "./bot-session-states";

describe("bot session intent authority", () => {
  it("defines one compatible intent for every active state", () => {
    for (const state of ACTIVE_BOT_SESSION_STATES) {
      const intent = inferHistoricalIntentFromState(state);
      assert.notEqual(intent, null, state);
      assert.equal(isIntentStateCompatible(intent, state), true, state);
    }
  });

  it("rejects incompatible intent and step combinations", () => {
    assert.equal(
      isIntentStateCompatible("CHECK_IN", "WAITING_PAYROLL_RECEIPT_PERIOD"),
      false,
    );
  });

  it("accepts either explicit confirmation outcome in a response session", () => {
    assert.equal(
      isExplicitIntentCompatibleWithSession(
        "confirm_attendance",
        "ATTENDANCE_CONFIRMATION_RESPONSE",
      ),
      true,
    );
    assert.equal(
      isExplicitIntentCompatibleWithSession(
        "report_unavailability",
        "ATTENDANCE_CONFIRMATION_RESPONSE",
      ),
      true,
    );
  });
});
