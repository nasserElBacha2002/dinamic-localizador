import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getDateIsoInTimezone } from "../utils/absence-date";

describe("absence company timezone validation helpers", () => {
  it("resolves different local calendar days near UTC midnight for distinct zones", () => {
    const nearUtcMidnight = new Date("2026-07-30T02:30:00.000Z");
    const buenosAires = getDateIsoInTimezone(nearUtcMidnight, "America/Argentina/Buenos_Aires");
    const tokyo = getDateIsoInTimezone(nearUtcMidnight, "Asia/Tokyo");
    assert.equal(buenosAires, "2026-07-29");
    assert.equal(tokyo, "2026-07-30");
  });
});
