import { getRelatedName } from "./display-safe";

/**
 * Official visible identity for an operation in list, mobile cards, and detail.
 *
 * Domain note: `Operation` has no dedicated name/title/code field. Product and API
 * identify operations by the linked service name (list sort `serviceName`,
 * `OperationLookup.name` is also the service name). Notes are free-text and are
 * not used as the primary label.
 *
 * Fallback: "Sin asignar" via `getRelatedName` — never raw technical IDs.
 */
export function getOperationDisplayName(
  operation: { service?: { name?: string | null } | null } | null | undefined,
): string {
  return getRelatedName(operation?.service ?? null);
}
