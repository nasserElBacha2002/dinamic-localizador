import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LOCALITY_ALIASES,
  resolveCanonicalLocality,
  SUGGESTED_LOCALITY_LABELS,
} from "./canonical-locality";

describe("resolveCanonicalLocality", () => {
  it("maps CABA / Capital / full city aliases to AR-CABA", () => {
    for (const label of [
      "CABA",
      "Capital",
      "Ciudad Autónoma de Buenos Aires",
      "Ciudad Autonoma de Buenos Aires",
      "capital federal",
    ]) {
      const resolved = resolveCanonicalLocality(label);
      assert.equal(resolved.status, "RESOLVED");
      assert.equal(resolved.code, "AR-CABA");
      assert.equal(resolved.geocodeRegion, "Ciudad Autónoma de Buenos Aires");
      assert.equal(resolved.strongRegion, "CABA");
      assert.equal(resolved.displayLocality, label.trim().replace(/\s+/g, " "));
    }
  });

  it("maps GBA to metro context with province-level strong validation", () => {
    const gba = resolveCanonicalLocality("GBA");
    assert.equal(gba.code, "AR-B-METRO");
    assert.equal(gba.geocodeRegion, "Buenos Aires");
    assert.equal(gba.strongRegion, "BUENOS_AIRES_PROVINCE");
  });

  it("maps Buenos Aires / Córdoba / Salta / Mendoza with accent tolerance", () => {
    assert.equal(resolveCanonicalLocality("Buenos Aires").code, "AR-B");
    assert.equal(resolveCanonicalLocality("Buenos Aires").strongRegion, "BUENOS_AIRES_PROVINCE");
    assert.equal(resolveCanonicalLocality("Córdoba").code, "AR-X-CORDOBA");
    assert.equal(resolveCanonicalLocality("Cordoba").code, "AR-X-CORDOBA");
    assert.equal(resolveCanonicalLocality("Salta").code, "AR-A-SALTA");
    assert.equal(resolveCanonicalLocality("Mendoza").code, "AR-M-MENDOZA");
  });

  it("keeps unknown and empty localities unresolved without inventing CABA", () => {
    assert.equal(resolveCanonicalLocality(null).status, "UNKNOWN");
    assert.equal(resolveCanonicalLocality("").status, "UNKNOWN");
    assert.equal(resolveCanonicalLocality("  ").code, null);
    const unknown = resolveCanonicalLocality("Zona X");
    assert.equal(unknown.status, "UNKNOWN");
    assert.equal(unknown.code, null);
    assert.equal(unknown.geocodeRegion, "Zona X");
  });

  it("exposes a finite alias table and suggested labels", () => {
    assert.ok(Object.keys(LOCALITY_ALIASES).length >= 10);
    assert.ok(SUGGESTED_LOCALITY_LABELS.includes("CABA"));
    assert.ok(SUGGESTED_LOCALITY_LABELS.includes("Mendoza"));
  });
});
