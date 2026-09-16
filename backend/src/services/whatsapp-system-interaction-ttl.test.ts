import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeSystemInteractionExpiresAt } from "../services/whatsapp-system-interaction.service";

describe("system interaction TTL derivation", () => {
  const now = new Date("2026-09-14T12:00:00.000Z");

  it("confirmation expires at scheduledStart", () => {
    const scheduledStart = new Date("2026-09-14T18:00:00.000Z");
    const expires = computeSystemInteractionExpiresAt({
      category: "ATTENDANCE_CONFIRMATION",
      now,
      scheduledStart,
    });
    assert.equal(expires.toISOString(), scheduledStart.toISOString());
  });

  it("arrival reminder uses lead + session TTL (not fixed 2h)", () => {
    const expires = computeSystemInteractionExpiresAt({
      category: "ARRIVAL_REMINDER",
      now,
    });
    const deltaMs = expires.getTime() - now.getTime();
    // lead (15m) + session TTL (>=1m from env); never a flat 2h constant
    assert.ok(deltaMs >= 16 * 60_000);
    assert.ok(deltaMs !== 2 * 60 * 60_000);
    assert.ok(deltaMs < 24 * 60 * 60_000);
  });

  it("no-checkin uses short window + session TTL", () => {
    const expires = computeSystemInteractionExpiresAt({
      category: "NO_CHECKIN_REMINDER",
      now,
    });
    const deltaMs = expires.getTime() - now.getTime();
    assert.ok(deltaMs >= 2 * 60_000);
    assert.ok(deltaMs < 2 * 60 * 60_000);
  });
});
