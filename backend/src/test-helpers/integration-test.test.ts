import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeSqlDateIso } from "./integration-test";

describe("normalizeSqlDateIso", () => {
  it("formats Date values as ISO date strings", () => {
    assert.equal(normalizeSqlDateIso(new Date("2026-07-13T00:00:00.000Z")), "2026-07-13");
  });

  it("keeps ISO date prefixes from string values", () => {
    assert.equal(normalizeSqlDateIso("2026-07-13T03:00:00.000Z"), "2026-07-13");
  });

  it("parses locale date strings returned by SQL drivers", () => {
    assert.equal(
      normalizeSqlDateIso(new Date("2026-07-13T00:00:00.000Z").toString()),
      "2026-07-13",
    );
  });
});
