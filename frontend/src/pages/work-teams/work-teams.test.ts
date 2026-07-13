import assert from "node:assert/strict";
import { describe, it } from "node:test";

const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();

describe("work teams list filters", () => {
  it("normalizes search terms for display helpers", () => {
    assert.equal(normalize(" Equipo   Norte "), "equipo norte");
  });
});
