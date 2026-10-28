import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CONFIRMATION_EXPIRED_USER_MESSAGE,
  isAttendanceConfirmationWindowOpen,
  mapConfirmationReplyTargetKind,
} from "./attendance-confirmation-validity";

describe("attendance-confirmation-validity", () => {
  it("keeps confirmation open strictly before scheduledStart", () => {
    const scheduledStart = "2026-08-26T22:00:00.000Z";
    assert.equal(
      isAttendanceConfirmationWindowOpen(scheduledStart, new Date("2026-08-26T21:59:59.999Z")),
      true,
    );
    assert.equal(
      isAttendanceConfirmationWindowOpen(scheduledStart, new Date("2026-08-26T22:00:00.000Z")),
      false,
    );
  });

  it("maps target kinds for open vs expired window", () => {
    assert.equal(mapConfirmationReplyTargetKind("PENDING", true), "eligible_pending");
    assert.equal(mapConfirmationReplyTargetKind("PENDING", false), "expired_pending");
    assert.equal(mapConfirmationReplyTargetKind("CONFIRMED", true), "confirmed_open");
    assert.equal(mapConfirmationReplyTargetKind("CONFIRMED", false), null);
    assert.equal(mapConfirmationReplyTargetKind("UNAVAILABLE", true), "unavailable_open");
  });

  it("exposes a confirmation-specific expired message distinct from session TTL copy", () => {
    assert.match(CONFIRMATION_EXPIRED_USER_MESSAGE, /ventana para confirmar/i);
    assert.equal(CONFIRMATION_EXPIRED_USER_MESSAGE.includes("ubicación"), false);
  });
});
