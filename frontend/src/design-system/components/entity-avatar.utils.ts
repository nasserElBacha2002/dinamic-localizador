import {
  ENTITY_AVATAR_BRAND_TONE,
  ENTITY_AVATAR_FALLBACK_INITIAL,
  ENTITY_AVATAR_PALETTE,
  ENTITY_IDENTITY_FALLBACK_LABEL,
} from "./entity-avatar.constants";
import type {
  EntityAvatarEntityType,
  EntityAvatarPaletteEntry,
  EntityAvatarTone,
} from "./entity-avatar.types";

/** Unicode letter or number (includes accented letters and Ñ). */
const LETTER_OR_NUMBER = /\p{L}|\p{N}/u;

function firstSignificantChar(value: string): string | null {
  for (const char of value) {
    if (LETTER_OR_NUMBER.test(char)) {
      return char;
    }
  }
  return null;
}

function splitNameWords(name: string): string[] {
  return name
    .trim()
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);
}

/**
 * Derive display initials from a visible entity name.
 * @param maxInitials 1 for company/service/operation; 2 for collaborators.
 */
export function getEntityInitials(
  name: string | null | undefined,
  maxInitials: 1 | 2 = 1,
): string {
  if (name == null) {
    return ENTITY_AVATAR_FALLBACK_INITIAL;
  }

  const words = splitNameWords(name);
  if (words.length === 0) {
    return ENTITY_AVATAR_FALLBACK_INITIAL;
  }

  if (maxInitials === 1) {
    const char = firstSignificantChar(words[0] ?? "");
    return char ? char.toLocaleUpperCase("es") : ENTITY_AVATAR_FALLBACK_INITIAL;
  }

  const firstWord = words[0] ?? "";
  const lastWord = words.length > 1 ? (words[words.length - 1] ?? "") : "";
  const first = firstSignificantChar(firstWord);
  const second = words.length > 1 ? firstSignificantChar(lastWord) : null;

  if (!first && !second) {
    return ENTITY_AVATAR_FALLBACK_INITIAL;
  }

  return `${first ? first.toLocaleUpperCase("es") : ""}${
    second ? second.toLocaleUpperCase("es") : ""
  }`;
}

/**
 * Stable non-negative palette index from an arbitrary string key.
 */
export function getStablePaletteIndex(value: string, paletteLength: number): number {
  if (paletteLength <= 0) {
    return 0;
  }

  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }

  // Ensure non-negative modulo for negative hashes.
  return ((hash % paletteLength) + paletteLength) % paletteLength;
}

/**
 * Color key: `${entityType}:${firstInitial}` (first initial uppercased, es locale).
 */
export function getEntityAvatarColorKey(
  initials: string,
  entityType: EntityAvatarEntityType,
): string {
  const firstInitial =
    initials.trim().charAt(0).toLocaleUpperCase("es") || ENTITY_AVATAR_FALLBACK_INITIAL;
  return `${entityType}:${firstInitial}`;
}

/**
 * Deterministic palette entry from entity type + first initial.
 * Collisions across different keys are valid for modular hashing.
 */
export function getEntityAvatarColor(
  initials: string,
  entityType: EntityAvatarEntityType,
  tone: EntityAvatarTone = "palette",
): EntityAvatarPaletteEntry {
  if (tone === "brand") {
    return ENTITY_AVATAR_BRAND_TONE;
  }

  const key = getEntityAvatarColorKey(initials, entityType);
  const index = getStablePaletteIndex(key, ENTITY_AVATAR_PALETTE.length);
  return ENTITY_AVATAR_PALETTE[index] ?? ENTITY_AVATAR_PALETTE[0]!;
}

export function getDefaultMaxInitials(entityType: EntityAvatarEntityType): 1 | 2 {
  return entityType === "collaborator" ? 2 : 1;
}

export function getDefaultAvatarShape(
  entityType: EntityAvatarEntityType,
): "rounded" | "circle" {
  return entityType === "collaborator" ? "circle" : "rounded";
}

/**
 * Visible title for EntityIdentity — never empty.
 * Avatar initials still derive from the raw `name` (empty → "?").
 */
export function resolveEntityIdentityDisplayName(
  name: string | null | undefined,
  fallbackLabel: string = ENTITY_IDENTITY_FALLBACK_LABEL,
): string {
  const trimmed = name?.trim();
  return trimmed ? trimmed : fallbackLabel;
}
