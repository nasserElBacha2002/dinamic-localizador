import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dateInputToIsoEnd, dateInputToIsoStart } from "./dates";

describe("dateInputToIsoStart", () => {
  it("converts start of day in Argentina to UTC+3 offset", () => {
    assert.equal(dateInputToIsoStart("2026-06-25"), "2026-06-25T03:00:00.000Z");
  });

  it("handles month boundaries without shifting to previous month", () => {
    assert.equal(dateInputToIsoStart("2026-06-24"), "2026-06-24T03:00:00.000Z");
    assert.equal(dateInputToIsoStart("2026-07-01"), "2026-07-01T03:00:00.000Z");
  });
});

describe("dateInputToIsoEnd", () => {
  it("converts end of day in Argentina to UTC+3 offset", () => {
    assert.equal(dateInputToIsoEnd("2026-06-25"), "2026-06-26T02:59:00.000Z");
  });
});
