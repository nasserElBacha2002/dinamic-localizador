import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isValidHHmm, parseSqlTimeToHHmm, toSqlTimeValue } from "./sql-time";

describe("isValidHHmm", () => {
  it("accepts valid times including single-digit hours", () => {
    assert.equal(isValidHHmm("20:30"), true);
    assert.equal(isValidHHmm("03:00"), true);
    assert.equal(isValidHHmm("3:00"), true);
  });

  it("rejects invalid real times", () => {
    assert.equal(isValidHHmm("24:00"), false);
    assert.equal(isValidHHmm("99:99"), false);
    assert.equal(isValidHHmm("12:60"), false);
    assert.equal(isValidHHmm("30:00"), false);
    assert.equal(isValidHHmm("invalid"), false);
  });
});

describe("parseSqlTimeToHHmm", () => {
  it("normalizes SQL TIME strings", () => {
    assert.equal(parseSqlTimeToHHmm("20:30:00"), "20:30");
    assert.equal(parseSqlTimeToHHmm("3:05:00"), "03:05");
  });
});

describe("toSqlTimeValue", () => {
  it("converts valid HH:mm values to SQL TIME fragments", () => {
    assert.equal(toSqlTimeValue("20:30"), "20:30:00");
    assert.equal(toSqlTimeValue("3:05"), "03:05:00");
  });

  it("returns null for empty or invalid values", () => {
    assert.equal(toSqlTimeValue(null), null);
    assert.equal(toSqlTimeValue(undefined), null);
    assert.equal(toSqlTimeValue("invalid"), null);
    assert.equal(toSqlTimeValue("99:99"), null);
    assert.equal(toSqlTimeValue("24:00"), null);
    assert.equal(toSqlTimeValue("12:60"), null);
  });
});
