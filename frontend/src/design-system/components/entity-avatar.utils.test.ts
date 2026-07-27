import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_THEME } from "@mantine/core";
import {
  ENTITY_AVATAR_BRAND_TONE,
  ENTITY_AVATAR_PALETTE,
} from "./entity-avatar.constants";
import {
  getEntityAvatarColor,
  getEntityAvatarColorKey,
  getEntityInitials,
  getStablePaletteIndex,
  resolveEntityIdentityDisplayName,
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

describe("getEntityAvatarColorKey", () => {
  it("includes entityType and normalized first initial", () => {
    assert.equal(getEntityAvatarColorKey("jp", "collaborator"), "collaborator:J");
    assert.equal(getEntityAvatarColorKey("á", "service"), "service:Á");
    assert.equal(getEntityAvatarColorKey("", "company"), "company:?");
  });

  it("is stable for the same inputs", () => {
    assert.equal(
      getEntityAvatarColorKey("Limpieza", "service"),
      getEntityAvatarColorKey("Limpieza", "service"),
    );
  });
});

describe("getEntityAvatarColor", () => {
  it("returns the same color for the same key", () => {
    assert.deepEqual(
      getEntityAvatarColor("L", "service"),
      getEntityAvatarColor("L", "service"),
    );
  });

  it("returns a valid palette entry for palette tone", () => {
    const result = getEntityAvatarColor("J", "collaborator");
    assert.ok(ENTITY_AVATAR_PALETTE.includes(result));
  });

  it("returns brand tone when requested", () => {
    assert.deepEqual(getEntityAvatarColor("D", "company", "brand"), ENTITY_AVATAR_BRAND_TONE);
  });

  it("never returns an out-of-range palette index", () => {
    const samples = ["A", "Z", "Ñ", "?", "3", "Á", "jp", ""];
    for (const sample of samples) {
      for (const entityType of ["company", "service", "collaborator", "operation"] as const) {
        const key = getEntityAvatarColorKey(sample, entityType);
        const index = getStablePaletteIndex(key, ENTITY_AVATAR_PALETTE.length);
        assert.ok(index >= 0 && index < ENTITY_AVATAR_PALETTE.length);
        assert.ok(ENTITY_AVATAR_PALETTE.includes(getEntityAvatarColor(sample, entityType)));
      }
    }
  });

  it("allows collisions across different keys (modular hash)", () => {
    // Distinct keys may map to the same index; that is valid and must not fail.
    const seen = new Map<number, string>();
    let collisionFound = false;
    for (const letter of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
      const key = getEntityAvatarColorKey(letter, "service");
      const index = getStablePaletteIndex(key, ENTITY_AVATAR_PALETTE.length);
      const previous = seen.get(index);
      if (previous && previous !== key) {
        collisionFound = true;
        assert.deepEqual(
          getEntityAvatarColor(letter, "service"),
          ENTITY_AVATAR_PALETTE[index],
        );
        break;
      }
      seen.set(index, key);
    }
    assert.equal(typeof collisionFound, "boolean");
  });

  it("does not use Math.random in the color path", () => {
    const source = `${getEntityAvatarColorKey.toString()}${getStablePaletteIndex.toString()}${getEntityAvatarColor.toString()}`;
    assert.equal(source.includes("Math.random"), false);
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

describe("resolveEntityIdentityDisplayName", () => {
  it("returns fallback for null, undefined, empty, and whitespace", () => {
    assert.equal(resolveEntityIdentityDisplayName(null), "Sin nombre");
    assert.equal(resolveEntityIdentityDisplayName(undefined), "Sin nombre");
    assert.equal(resolveEntityIdentityDisplayName(""), "Sin nombre");
    assert.equal(resolveEntityIdentityDisplayName("   "), "Sin nombre");
  });

  it("returns trimmed valid names and custom fallback", () => {
    assert.equal(resolveEntityIdentityDisplayName("  Centro  "), "Centro");
    assert.equal(resolveEntityIdentityDisplayName(null, "Sin servicio"), "Sin servicio");
  });
});

describe("ENTITY_AVATAR_PALETTE contrast", () => {
  function relativeLuminance(hex: string): number {
    const normalized = hex.replace("#", "");
    const full =
      normalized.length === 3
        ? normalized
            .split("")
            .map((part) => part + part)
            .join("")
        : normalized;
    const value = Number.parseInt(full, 16);
    const channels = [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
    const toLinear = (channel: number) =>
      channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    const [r, g, b] = channels.map(toLinear);
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  }

  function contrastRatio(foreground: string, background: string): number {
    const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
    const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
    return (lighter + 0.05) / (darker + 0.05);
  }

  function resolveMantineVar(cssVar: string): string {
    const match = /^var\(--mantine-color-([a-z]+)-(\d)\)$/.exec(cssVar);
    assert.ok(match, `unexpected palette token: ${cssVar}`);
    const [, colorName, shade] = match;
    const tuple = DEFAULT_THEME.colors[colorName as keyof typeof DEFAULT_THEME.colors];
    assert.ok(Array.isArray(tuple), `missing Mantine color ${colorName}`);
    return tuple[Number(shade)]!;
  }

  it("keeps every palette pair at WCAG AA normal-text contrast (≥ 4.5)", () => {
    for (const entry of ENTITY_AVATAR_PALETTE) {
      const background = resolveMantineVar(entry.background);
      const foreground = resolveMantineVar(entry.color);
      const ratio = contrastRatio(foreground, background);
      assert.ok(
        ratio >= 4.5,
        `${entry.background}/${entry.color} contrast ${ratio.toFixed(2)} < 4.5`,
      );
    }
  });
});
