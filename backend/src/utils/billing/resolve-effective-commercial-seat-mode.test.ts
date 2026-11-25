import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseCommercialSeatQuotaMode,
  resolveEffectiveCommercialSeatMode,
} from "./resolve-effective-commercial-seat-mode";

describe("resolveEffectiveCommercialSeatMode", () => {
  it("implements the DIN-463 matrix", () => {
    assert.equal(resolveEffectiveCommercialSeatMode("DISABLED", null), "DISABLED");
    assert.equal(resolveEffectiveCommercialSeatMode("DISABLED", "OBSERVE"), "DISABLED");
    assert.equal(resolveEffectiveCommercialSeatMode("DISABLED", "ENFORCE"), "DISABLED");

    assert.equal(resolveEffectiveCommercialSeatMode("OBSERVE", null), "OBSERVE");
    assert.equal(resolveEffectiveCommercialSeatMode("OBSERVE", "OBSERVE"), "OBSERVE");
    assert.equal(resolveEffectiveCommercialSeatMode("OBSERVE", "ENFORCE"), "OBSERVE");
    assert.equal(resolveEffectiveCommercialSeatMode("OBSERVE", "DISABLED"), "DISABLED");

    assert.equal(resolveEffectiveCommercialSeatMode("ENFORCE", null), "OBSERVE");
    assert.equal(resolveEffectiveCommercialSeatMode("ENFORCE", "OBSERVE"), "OBSERVE");
    assert.equal(resolveEffectiveCommercialSeatMode("ENFORCE", "ENFORCE"), "ENFORCE");
    assert.equal(resolveEffectiveCommercialSeatMode("ENFORCE", "DISABLED"), "DISABLED");
  });

  it("never resolves invalid input to ENFORCE", () => {
    assert.equal(resolveEffectiveCommercialSeatMode("BOGUS" as "DISABLED", "ENFORCE"), "DISABLED");
    assert.equal(parseCommercialSeatQuotaMode("garbage"), "DISABLED");
  });
});