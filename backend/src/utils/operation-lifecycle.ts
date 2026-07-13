import type { Operation } from "../types/domain";
import type { OperationStatus } from "./operation-status";

export const getOperationEffectiveEnd = (
  scheduledStart: string | null,
  scheduledEnd: string | null,
  lateToleranceMinutes: number,
): Date | null => {
  if (!scheduledStart) {
    return null;
  }

  if (scheduledEnd) {
    return new Date(scheduledEnd);
  }

  const start = new Date(scheduledStart);
  return new Date(start.getTime() + lateToleranceMinutes * 60 * 1000);
};

export const resolveLifecycleOperationStatus = (
  operation: Pick<
    Operation,
    | "operationKind"
    | "status"
    | "scheduledStart"
    | "scheduledEnd"
    | "earlyToleranceMinutes"
    | "lateToleranceMinutes"
  >,
  at: Date = new Date(),
): OperationStatus => {
  if (operation.status === "CANCELLED" || operation.status === "COMPLETED") {
    return operation.status;
  }

  if (operation.operationKind === "RECURRING" || !operation.scheduledStart) {
    return operation.status === "IN_PROGRESS" ? "IN_PROGRESS" : "SCHEDULED";
  }

  const start = new Date(operation.scheduledStart);
  const end = getOperationEffectiveEnd(
    operation.scheduledStart,
    operation.scheduledEnd,
    operation.lateToleranceMinutes,
  );

  if (end && at >= end) {
    return "COMPLETED";
  }

  if (at >= start) {
    return "IN_PROGRESS";
  }

  return "SCHEDULED";
};

export const isOperationStartInPast = (scheduledStart: string, at: Date = new Date()): boolean =>
  new Date(scheduledStart) < at;
