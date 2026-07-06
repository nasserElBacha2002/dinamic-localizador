import type { Operation } from "../types/domain";
import type { OperationStatus } from "./operation-status";

export const getOperationEffectiveEnd = (
  scheduledStart: string,
  scheduledEnd: string | null,
  lateToleranceMinutes: number,
): Date => {
  if (scheduledEnd) {
    return new Date(scheduledEnd);
  }

  const start = new Date(scheduledStart);
  return new Date(start.getTime() + lateToleranceMinutes * 60 * 1000);
};

export const resolveLifecycleOperationStatus = (
  operation: Pick<
    Operation,
    "status" | "scheduledStart" | "scheduledEnd" | "earlyToleranceMinutes" | "lateToleranceMinutes"
  >,
  at: Date = new Date(),
): OperationStatus => {
  if (operation.status === "CANCELLED" || operation.status === "COMPLETED") {
    return operation.status;
  }

  const start = new Date(operation.scheduledStart);
  const end = getOperationEffectiveEnd(
    operation.scheduledStart,
    operation.scheduledEnd,
    operation.lateToleranceMinutes,
  );

  if (at >= end) {
    return "COMPLETED";
  }

  if (at >= start) {
    return "IN_PROGRESS";
  }

  return "SCHEDULED";
};

export const isOperationStartInPast = (scheduledStart: string, at: Date = new Date()): boolean =>
  new Date(scheduledStart) < at;
