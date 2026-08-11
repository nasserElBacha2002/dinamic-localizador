import {
  NAVIGABLE_ENTITY_DEFINITIONS,
  listNavigableEntityTypes,
  type NavigableEntityType,
} from "../../routes/navigable-entity-definitions";
import type { EntityRouteDefinition } from "./entity-link.types";

/**
 * Detail path + access registry — aliases the canonical navigable definitions.
 */
export const ENTITY_ROUTE_REGISTRY: Record<NavigableEntityType, EntityRouteDefinition> =
  NAVIGABLE_ENTITY_DEFINITIONS;

export function normalizeEntityId(entityId: string | number | null | undefined): string | null {
  if (entityId === null || entityId === undefined) {
    return null;
  }
  const value = String(entityId).trim();
  return value.length > 0 ? value : null;
}

/** Pure path builder — returns null when id is missing. */
export function resolveEntityDetailPath(
  entityType: NavigableEntityType,
  entityId: string | number | null | undefined,
): string | null {
  const id = normalizeEntityId(entityId);
  if (!id) {
    return null;
  }
  const definition = ENTITY_ROUTE_REGISTRY[entityType];
  return definition.buildPath(encodeURIComponent(id));
}

export { listNavigableEntityTypes };
