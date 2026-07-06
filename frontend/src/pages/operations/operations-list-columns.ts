import type { OperationWithService } from "../../types/operation";
import { getRelatedName, safeText } from "../../utils/display-safe";

export function getOperationServiceName(row: OperationWithService): string {
  return getRelatedName(row.service);
}

export function getOperationServiceAddress(row: OperationWithService): string {
  return safeText(row.service?.address ?? null);
}
