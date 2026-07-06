import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BotSessionState } from "../types/twilio.types";
import {
  ACTIVE_SESSION_STATES,
  buildSessionExpiresAt,
  EXPIRED_SESSION_USER_MESSAGE,
  isActiveSessionState,
  isSessionActive,
  isSessionExpiredByTime,
  isSessionTimeValid,
} from "./bot-session-expiration";

const session = (state: BotSessionState, expiresAt: string) => ({ state, expiresAt });

describe("bot session expiration helpers", () => {
  it("defines only the expected active states", () => {
    assert.deepEqual(ACTIVE_SESSION_STATES, [
      "WAITING_LOCATION",
      "WAITING_OPERATION_SELECTION",
      "WAITING_CHECKOUT_LOCATION",
      "WAITING_CHECKOUT_OPERATION_SELECTION",
      "WAITING_ABSENCE_TYPE",
      "WAITING_ABSENCE_START_DATE",
      "WAITING_ABSENCE_END_DATE",
      "WAITING_ABSENCE_REASON",
      "WAITING_ABSENCE_CONFIRMATION",
      "WAITING_CONFIRM_ATTENDANCE_SELECTION",
      "WAITING_UNAVAILABILITY_SELECTION",
      "WAITING_ATTENDANCE_CONFIRMATION_RESPONSE",
    ]);
  });

  it("builds expires_at from UTC now and TTL minutes", () => {
    const now = new Date("2026-06-16T12:00:00.000Z");
    const expiresAt = buildSessionExpiresAt(15, now);
    assert.equal(expiresAt.toISOString(), "2026-06-16T12:15:00.000Z");
  });

  it("treats a future session as active", () => {
    const now = new Date("2026-06-16T12:00:00.000Z");
    const active = session("WAITING_LOCATION", "2026-06-16T12:10:00.000Z");
    assert.equal(isSessionActive(active, now), true);
    assert.equal(isSessionExpiredByTime(active, now), false);
  });

  it("treats a past session as expired by time", () => {
    const now = new Date("2026-06-16T12:00:00.000Z");
    const expired = session("WAITING_LOCATION", "2026-06-16T11:59:00.000Z");
    assert.equal(isSessionActive(expired, now), false);
    assert.equal(isSessionExpiredByTime(expired, now), true);
  });

  it("never treats terminal states as active", () => {
    const now = new Date("2026-06-16T12:00:00.000Z");
    const terminal = session("EXPIRED", "2026-06-16T12:10:00.000Z");
    assert.equal(isActiveSessionState(terminal.state), false);
    assert.equal(isSessionActive(terminal, now), false);
    assert.equal(isSessionExpiredByTime(terminal, now), false);
  });

  it("does not allow EXPIRED to be considered revivable", () => {
    assert.equal(isActiveSessionState("EXPIRED"), false);
    assert.equal(isActiveSessionState("COMPLETED"), false);
    assert.equal(isActiveSessionState("CANCELLED"), false);
  });

  it("validates session time independently from state", () => {
    const now = new Date("2026-06-16T12:00:00.000Z");
    assert.equal(isSessionTimeValid("2026-06-16T12:01:00.000Z", now), true);
    assert.equal(isSessionTimeValid("2026-06-16T11:59:00.000Z", now), false);
  });

  it("uses the expected user-facing expiration message", () => {
    assert.match(EXPIRED_SESSION_USER_MESSAGE, /La solicitud anterior venció/);
    assert.match(EXPIRED_SESSION_USER_MESSAGE, /Llegué/);
  });
});

describe("TTL renewal rules", () => {
  it("renews expiration only when explicitly building a new deadline", () => {
    const first = buildSessionExpiresAt(15, new Date("2026-06-16T12:00:00.000Z"));
    const renewed = buildSessionExpiresAt(15, new Date("2026-06-16T12:05:00.000Z"));
    assert.ok(renewed.getTime() > first.getTime());
  });

  it("does not change expiration when only reading an active session", () => {
    const expiresAt = "2026-06-16T12:15:00.000Z";
    const active = session("WAITING_OPERATION_SELECTION", expiresAt);
    const now = new Date("2026-06-16T12:05:00.000Z");
    assert.equal(isSessionActive(active, now), true);
    assert.equal(active.expiresAt, expiresAt);
  });
});
