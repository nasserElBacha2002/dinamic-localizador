import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { localityCapitalHint, SUGGESTED_LOCALITY_LABELS } from "./canonical-locality";

describe("canonical-locality (frontend UX)", () => {
  it("hints Capital → CABA without rewriting", () => {
    assert.equal(localityCapitalHint("Capital"), "¿Quisiste decir CABA?");
    assert.equal(localityCapitalHint("capital federal"), "¿Quisiste decir CABA?");
    assert.equal(localityCapitalHint("CABA"), null);
    assert.equal(localityCapitalHint("GBA"), null);
  });

  it("exposes open suggestions only (no closed enum)", () => {
    assert.ok(SUGGESTED_LOCALITY_LABELS.includes("CABA"));
    assert.ok(SUGGESTED_LOCALITY_LABELS.includes("GBA"));
    assert.ok(SUGGESTED_LOCALITY_LABELS.includes("Mendoza"));
  });
});
