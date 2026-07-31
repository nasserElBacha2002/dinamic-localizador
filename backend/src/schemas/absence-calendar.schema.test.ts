import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createAbsenceCalendarSchema } from "./absence-calendar.schema";

describe("absence calendar timezone schema", () => {
  it("accepts America/Argentina/Buenos_Aires", () => {
    const parsed = createAbsenceCalendarSchema.parse({
      name: "Default",
      timezone: "America/Argentina/Buenos_Aires",
    });
    assert.equal(parsed.timezone, "America/Argentina/Buenos_Aires");
  });

  it("accepts UTC", () => {
    const parsed = createAbsenceCalendarSchema.parse({
      name: "UTC cal",
      timezone: "UTC",
    });
    assert.equal(parsed.timezone, "UTC");
  });

  it("accepts a DST zone", () => {
    const parsed = createAbsenceCalendarSchema.parse({
      name: "NY",
      timezone: "America/New_York",
    });
    assert.equal(parsed.timezone, "America/New_York");
  });

  it("rejects an invalid timezone", () => {
    assert.throws(
      () =>
        createAbsenceCalendarSchema.parse({
          name: "Bad",
          timezone: "Not/A_Real_Zone",
        }),
    );
  });
});
