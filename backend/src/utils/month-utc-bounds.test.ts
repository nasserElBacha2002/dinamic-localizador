import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getMonthUtcBounds } from "./month-utc-bounds";

describe("getMonthUtcBounds", () => {
  it("uses BOT timezone for September 2026 Buenos Aires", () => {
    const bounds = getMonthUtcBounds(2026, 9, "America/Argentina/Buenos_Aires");
    assert.equal(bounds.monthStartUtc.toISOString(), "2026-09-01T03:00:00.000Z");
    assert.equal(bounds.nextMonthStartUtc.toISOString(), "2026-10-01T03:00:00.000Z");
  });

  it("handles DST transition months independently (America/New_York)", () => {
    const march = getMonthUtcBounds(2026, 3, "America/New_York");
    const november = getMonthUtcBounds(2026, 11, "America/New_York");
    // EST UTC-5 before spring-forward; EDT UTC-4 after.
    assert.equal(march.monthStartUtc.toISOString(), "2026-03-01T05:00:00.000Z");
    assert.equal(march.nextMonthStartUtc.toISOString(), "2026-04-01T04:00:00.000Z");
    assert.equal(november.monthStartUtc.toISOString(), "2026-11-01T04:00:00.000Z");
    assert.equal(november.nextMonthStartUtc.toISOString(), "2026-12-01T05:00:00.000Z");
  });

  it("rejects invalid month", () => {
    assert.throws(() => getMonthUtcBounds(2026, 13, "America/Argentina/Buenos_Aires"));
  });
});
