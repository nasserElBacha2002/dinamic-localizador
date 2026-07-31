import type { OperationWithService } from "../../types/operation";
import { getOperationDisplayName } from "../../utils/operation-display";
import { safeText } from "../../utils/display-safe";

/** @deprecated Prefer {@link getOperationDisplayName} — same service-based identity. */
export function getOperationServiceName(row: OperationWithService): string {
  return getOperationDisplayName(row);
}

export function getOperationServiceAddress(row: OperationWithService): string {
  return safeText(row.service?.address ?? null);
}
