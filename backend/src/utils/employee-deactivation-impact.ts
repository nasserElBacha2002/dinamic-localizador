import { DateTime } from "luxon";
import type { OperationKind } from "../constants/operation-kind";
import type { OperationStatus } from "../types/domain";

export interface DeactivationImpactCandidate {
  assignmentId: string;
  operationId: string;
  operationKind: OperationKind;
  operationStatus: OperationStatus;
  workdayId: string | null;
  employeeWorkdayId: string | null;
  date: string | null;
  expectedStartAt: string | null;
  expectedEndAt: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  assignmentValidFrom: string;
  assignmentValidUntil: string | null;
  assignmentCancelledAt: string | null;
  locationName: string;
  workTeamName: string | null;
}

/** True when the assignment period still covers company-local today or future dates. */
export const isAssignmentPeriodOpen = (input: {
  validFrom: string;
  validUntil: string | null;
  cancelledAt: string | null;
  companyTodayIso: string;
}): boolean => {
  if (input.cancelledAt) {
    return false;
  }
  if (input.validUntil && input.validUntil < input.companyTodayIso) {
    return false;
  }
  return true;
};

/**
 * Operational impact uses status + temporal window (company TZ), not status alone.
 * Past SCHEDULED ops whose window already ended are treated as historical.
 */
export const hasOperationalTemporalImpact = (input: {
  operationStatus: OperationStatus;
  operationKind: OperationKind;
  companyTodayIso: string;
  referenceAt: Date;
  workDate: string | null;
  expectedStartAt: string | null;
  expectedEndAt: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
}): boolean => {
  if (input.operationStatus === "CANCELLED" || input.operationStatus === "COMPLETED") {
    return false;
  }

  if (input.operationStatus === "IN_PROGRESS") {
    return true;
  }

  // Workday-level: future/today by calendar, or end instant still ahead.
  if (input.workDate) {
    if (input.workDate >= input.companyTodayIso) {
      return true;
    }
    if (input.expectedEndAt) {
      return new Date(input.expectedEndAt).getTime() >= input.referenceAt.getTime();
    }
    return false;
  }

  // Assignment without materialized workday (common for future ONE_TIME fixtures).
  if (input.operationKind === "RECURRING") {
    return true;
  }

  const endIso = input.scheduledEnd ?? input.scheduledStart;
  if (!endIso) {
    return true;
  }
  return new Date(endIso).getTime() >= input.referenceAt.getTime();
};

export const formatClockInTimezone = (
  isoInstant: string | null,
  timezone: string,
): string | null => {
  if (!isoInstant) {
    return null;
  }
  const local = DateTime.fromISO(isoInstant, { zone: "utc" }).setZone(timezone);
  if (!local.isValid) {
    return null;
  }
  return local.toFormat("HH:mm");
};

export const buildDeactivationImpactRow = (
  candidate: DeactivationImpactCandidate,
  timezone: string,
): {
  assignmentId: string;
  operationId: string;
  operationName: string;
  operationType: OperationKind;
  workdayId: string | null;
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  status: OperationStatus;
  locationName: string;
  workTeamName: string | null;
} => ({
  assignmentId: candidate.assignmentId,
  operationId: candidate.operationId,
  operationName: candidate.locationName,
  operationType: candidate.operationKind,
  workdayId: candidate.workdayId,
  date: candidate.date,
  startTime: formatClockInTimezone(candidate.expectedStartAt ?? candidate.scheduledStart, timezone),
  endTime: formatClockInTimezone(candidate.expectedEndAt ?? candidate.scheduledEnd, timezone),
  status: candidate.operationStatus,
  locationName: candidate.locationName,
  workTeamName: candidate.workTeamName,
});
