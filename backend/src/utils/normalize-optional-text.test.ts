import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeOptionalText, SERVICE_FORMAT_MAX_LENGTH } from "./normalize-optional-text";

describe("normalizeOptionalText", () => {
  it("trims and converts empty to null", () => {
    assert.equal(normalizeOptionalText(null), null);
    assert.equal(normalizeOptionalText(undefined), null);
    assert.equal(normalizeOptionalText(""), null);
    assert.equal(normalizeOptionalText("   "), null);
    assert.equal(normalizeOptionalText("  Palermo  "), "Palermo");
  });

  it("preserves casing", () => {
    assert.equal(normalizeOptionalText("CABA"), "CABA");
    assert.equal(normalizeOptionalText("caba"), "caba");
  });

  it("exports the contractual format max length", () => {
    assert.equal(SERVICE_FORMAT_MAX_LENGTH, 80);
  });
});
