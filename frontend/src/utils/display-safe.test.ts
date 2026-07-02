import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DISPLAY_FALLBACK,
  UNASSIGNED_LABEL,
  formatDistanceMeters,
  getRelatedName,
  safeArrayCount,
  safeText,
} from "./display-safe";

describe("display-safe helpers", () => {
  it("safeText returns fallback for empty values", () => {
    assert.equal(safeText(null), DISPLAY_FALLBACK);
    assert.equal(safeText(undefined), DISPLAY_FALLBACK);
    assert.equal(safeText("   "), DISPLAY_FALLBACK);
    assert.equal(safeText(" Centro "), "Centro");
  });

  it("getRelatedName returns Sin asignar when nested name is missing", () => {
    assert.equal(getRelatedName(undefined), UNASSIGNED_LABEL);
    assert.equal(getRelatedName({ name: " " }), UNASSIGNED_LABEL);
    assert.equal(getRelatedName({ name: "Ana" }), "Ana");
  });

  it("safeArrayCount handles undefined arrays", () => {
    assert.equal(safeArrayCount(undefined), 0);
    assert.equal(safeArrayCount(["a"]), 1);
  });

  it("formatDistanceMeters handles missing values", () => {
    assert.equal(formatDistanceMeters(undefined), DISPLAY_FALLBACK);
    assert.equal(formatDistanceMeters(12.34), "12.3 m");
  });
});
