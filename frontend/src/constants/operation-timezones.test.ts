import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_OPERATION_TIMEZONE,
  getCanonicalOperationTimezone,
  getOperationTimezoneOptions,
} from "./operation-timezones";

describe("operation-timezones", () => {
  it("includes default Argentina timezone", () => {
    const options = getOperationTimezoneOptions();
    assert.ok(options.some((option) => option.value === DEFAULT_OPERATION_TIMEZONE));
  });

  it("deduplicates timezones with the same GMT offset", () => {
    const options = getOperationTimezoneOptions();
    const argentinaOffsets = options.filter((option) => option.label.includes("GMT-3"));
    assert.equal(argentinaOffsets.length, 1);
    assert.match(argentinaOffsets[0]?.label ?? "", /Argentina/);
    assert.doesNotMatch(
      options.map((option) => option.label).join("\n"),
      /Cordoba|Mendoza|Salta|Tucuman/,
    );
  });

  it("labels options by GMT offset and region", () => {
    const options = getOperationTimezoneOptions();
    const argentina = options.find((option) => option.value === DEFAULT_OPERATION_TIMEZONE);
    assert.match(argentina?.label ?? "", /^GMT-3 — Argentina$/);
  });

  it("canonicalizes Argentina regional zones to Buenos Aires", () => {
    assert.equal(
      getCanonicalOperationTimezone("America/Argentina/Cordoba"),
      DEFAULT_OPERATION_TIMEZONE,
    );
  });

  it("includes current value when offset is not in curated list", () => {
    const options = getOperationTimezoneOptions("Asia/Tokyo");
    assert.ok(options.some((option) => option.value === "Asia/Tokyo"));
  });
});
