import type { AbsenceRequestStatus } from "../types/absence";

export interface BalanceDayTotals {
  assignedDays: number;
  approvedDays: number;
  pendingDays: number;
  rejectedDays: number;
  cancelledDays: number;
}

export interface ComputedBalanceCounters {
  availableDays: number;
  projectedAvailableDays: number;
}

export const computeBalanceCounters = (totals: Pick<BalanceDayTotals, "assignedDays" | "approvedDays" | "pendingDays">): ComputedBalanceCounters => ({
  availableDays: totals.assignedDays - totals.approvedDays,
  projectedAvailableDays: totals.assignedDays - totals.approvedDays - totals.pendingDays,
});

export const getAbsenceRequestYear = (startDate: string): number => Number.parseInt(startDate.slice(0, 4), 10);

export const computeAvailableAfterApproval = (input: {
  assignedDays: number;
  approvedDays: number;
  requestDays: number;
  requestStatus: AbsenceRequestStatus;
}): number => {
  if (input.requestStatus === "APPROVED") {
    return input.assignedDays - input.approvedDays;
  }

  return input.assignedDays - input.approvedDays - input.requestDays;
};

export const hasSufficientBalanceForApproval = (input: {
  assignedDays: number;
  approvedDays: number;
  requestDays: number;
}): boolean => input.assignedDays - input.approvedDays >= input.requestDays;
