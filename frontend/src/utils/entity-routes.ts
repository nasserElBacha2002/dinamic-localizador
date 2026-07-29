/**
 * Canonical entity route helpers for the detail / edit / create convention.
 *
 * Phase 1: paths only — entity detail pages land in later phases.
 * Do not redirect `/:id` → `/:id/edit`; that would perpetuate edit-as-default.
 *
 * Query cache convention (do not invent new key shapes in later phases):
 * - Detail pages and `/edit` share the same entity-by-id query.
 * - After a successful update: invalidate detail + list (+ dependents already wired in hooks).
 * - Prefer existing `useEmployee` / `useService` / `useWorkTeam` / `useOperation` keys scoped by company.
 */

export type EntityRouteKey = "employees" | "services" | "work-teams" | "operations";

export function getEntityListPath(entity: EntityRouteKey): string {
  return `/${entity}`;
}

export function getEntityCreatePath(entity: EntityRouteKey): string {
  return `/${entity}/new`;
}

export function getEntityDetailPath(entity: EntityRouteKey, id: string): string {
  return `/${entity}/${id}`;
}

export function getEntityEditPath(entity: EntityRouteKey, id: string): string {
  return `/${entity}/${id}/edit`;
}

/** True when the current pathname is the edit route for an entity id segment. */
export function isEntityEditPath(pathname: string, entity: EntityRouteKey): boolean {
  const prefix = `/${entity}/`;
  if (!pathname.startsWith(prefix)) {
    return false;
  }
  return pathname.endsWith("/edit");
}
