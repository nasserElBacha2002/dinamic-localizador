import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ENTITY_AVATAR_PALETTE } from "./entity-avatar.constants";
import {
  getEntityAvatarColor,
  getEntityInitials,
  getStablePaletteIndex,
} from "./entity-avatar.utils";

describe("getEntityInitials", () => {
  it("returns one initial for services", () => {
    assert.equal(getEntityInitials("Limpieza industrial", 1), "L");
  });

  it("returns two initials for collaborators", () => {
    assert.equal(getEntityInitials("Juan Pérez", 2), "JP");
  });

  it("normalizes whitespace", () => {
    assert.equal(getEntityInitials("  María   López  ", 2), "ML");
  });

  it("supports accented characters and Ñ", () => {
    assert.equal(getEntityInitials("Álvarez", 1), "Á");
    assert.equal(getEntityInitials("Ñandú Sur", 1), "Ñ");
    assert.equal(getEntityInitials("Ñuñez Ortega", 2), "ÑO");
  });

  it("returns fallback for empty values", () => {
    assert.equal(getEntityInitials("", 1), "?");
    assert.equal(getEntityInitials(null, 1), "?");
    assert.equal(getEntityInitials(undefined, 1), "?");
    assert.equal(getEntityInitials("   ", 2), "?");
  });

  it("skips leading symbols and keeps numbers", () => {
    assert.equal(getEntityInitials("***Limpieza", 1), "L");
    assert.equal(getEntityInitials("3 Sucursales", 1), "3");
  });

  it("uses a single initial when only one word for collaborators", () => {
    assert.equal(getEntityInitials("María", 2), "M");
  });
});

describe("getEntityAvatarColor", () => {
  it("returns the same color for the same key", () => {
    assert.deepEqual(
      getEntityAvatarColor("L", "service"),
      getEntityAvatarColor("L", "service"),
    );
  });

  it("returns a valid palette entry", () => {
    const result = getEntityAvatarColor("J", "collaborator");
    assert.ok(ENTITY_AVATAR_PALETTE.includes(result));
  });

  it("never returns an out-of-range palette index", () => {
    const samples = ["A", "Z", "Ñ", "?", "3", "Á", "jp", ""];
    for (const sample of samples) {
      for (const entityType of ["company", "service", "collaborator", "operation"] as const) {
        const index = getStablePaletteIndex(
          `${entityType}:${sample.charAt(0) || "?"}`,
          ENTITY_AVATAR_PALETTE.length,
        );
        assert.ok(index >= 0 && index < ENTITY_AVATAR_PALETTE.length);
        assert.ok(ENTITY_AVATAR_PALETTE.includes(getEntityAvatarColor(sample, entityType)));
      }
    }
  });

  it("can differ by entity type for the same letter", () => {
    // Not guaranteed for every letter, but hash keys differ so index may differ.
    const service = getStablePaletteIndex("service:L", ENTITY_AVATAR_PALETTE.length);
    const collaborator = getStablePaletteIndex("collaborator:L", ENTITY_AVATAR_PALETTE.length);
    assert.notEqual(service, collaborator);
  });
});

describe("getStablePaletteIndex", () => {
  it("handles empty palette length safely", () => {
    assert.equal(getStablePaletteIndex("x", 0), 0);
  });

  it("is stable across calls", () => {
    assert.equal(getStablePaletteIndex("service:A", 10), getStablePaletteIndex("service:A", 10));
  });
});
