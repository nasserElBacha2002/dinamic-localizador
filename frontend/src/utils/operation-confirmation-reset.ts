import type { OperationFormValues } from "../schemas/operation.schema";
import type { OperationDetail } from "../types/operation";
import { datetimeLocalToIso } from "./dates";

/**
 * Mirrors backend `operationService.updateOneTime` scheduleChanged:
 * confirmation reset runs only when ONE_TIME `scheduledStart` changes materially.
 * Recurring updates do not call `resetConfirmationsForOperationScheduleChange`.
 */
export function doesOperationUpdateResetConfirmations(
  operation: OperationDetail,
  values: OperationFormValues,
): boolean {
  if ((operation.operationKind ?? "ONE_TIME") !== "ONE_TIME") {
    return false;
  }

  if (!operation.scheduledStart || !values.scheduledStart.trim()) {
    return false;
  }

  const nextStartIso = datetimeLocalToIso(values.scheduledStart);
  return new Date(nextStartIso).getTime() !== new Date(operation.scheduledStart).getTime();
}
