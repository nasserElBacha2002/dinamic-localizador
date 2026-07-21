import { DateTime } from "luxon";
import type { OperationKind } from "../constants/operation-kind";
import type { OperationStatus } from "../types/domain";
import { addDaysToDateIso } from "./recurring-workday-instant";

export interface DeactivationWorkdaySnapshot {
  employeeWorkdayId: string;
  operationWorkdayId: string;
  workDate: string;
  expectationStatus: string;
  hasAttendance: boolean;
  expectedStartAt: string | null;
  expectedEndAt: string | null;
}

export interface DeactivationAssignmentSnapshot {
  assignmentId: string;
  operationId: string;
  operationKind: OperationKind;
  operationStatus: OperationStatus;
  operationNotes: string | null;
  locationName: string;
  workTeamName: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  validFrom: string;
  validUntil: string | null;
  cancelledAt: string | null;
  workdays: DeactivationWorkdaySnapshot[];
}

export interface DeactivationImpactRow {
  assignmentId: string;
  operationId: string;
  operationName: string;
  operationType: OperationKind;
  workdayId: string | null;
  employeeWorkdayId: string | null;
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  status: OperationStatus;
  locationName: string;
  workTeamName: string | null;
}

export interface DeactivationReleasePlan {
  employeeWorkdayIdsToCancel: string[];
  assignmentsToCancel: string[];
  assignmentsToEnd: Array<{ assignmentId: string; effectiveDate: string }>;
  affectedWorkdayRows: DeactivationImpactRow[];
  affectedAssignmentIds: string[];
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

  if (input.workDate) {
    if (input.workDate >= input.companyTodayIso) {
      return true;
    }
    if (input.expectedEndAt) {
      return new Date(input.expectedEndAt).getTime() >= input.referenceAt.getTime();
    }
    return false;
  }

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

export const resolveOperationDisplayName = (input: {
  notes: string | null;
  locationName: string;
  date: string | null;
  scheduledStart: string | null;
}): string => {
  const notes = input.notes?.trim();
  if (notes) {
    return notes;
  }

  const dateLabel =
    input.date ??
    (input.scheduledStart ? input.scheduledStart.slice(0, 10) : null);
  if (dateLabel) {
    const [year, month, day] = dateLabel.split("-");
    if (year && month && day) {
      return `${input.locationName} · ${day}/${month}/${year}`;
    }
  }

  return input.locationName;
};

const assignmentHasHistory = (
  assignment: DeactivationAssignmentSnapshot,
  companyTodayIso: string,
): boolean => {
  if (assignment.validFrom < companyTodayIso) {
    return true;
  }

  for (const workday of assignment.workdays) {
    if (workday.workDate < companyTodayIso) {
      return true;
    }
    if (workday.hasAttendance) {
      return true;
    }
    if (workday.expectationStatus !== "EXPECTED" && workday.expectationStatus !== "CANCELLED") {
      return true;
    }
  }

  return false;
};

const isCancellableWorkday = (
  workday: DeactivationWorkdaySnapshot,
  companyTodayIso: string,
  referenceAt: Date,
  operationStatus: OperationStatus,
  operationKind: OperationKind,
  scheduledStart: string | null,
  scheduledEnd: string | null,
): boolean => {
  if (workday.expectationStatus !== "EXPECTED") {
    return false;
  }
  if (workday.hasAttendance) {
    return false;
  }
  // Never alter past calendar workdays.
  if (workday.workDate < companyTodayIso) {
    return false;
  }

  return hasOperationalTemporalImpact({
    operationStatus,
    operationKind,
    companyTodayIso,
    referenceAt,
    workDate: workday.workDate,
    expectedStartAt: workday.expectedStartAt,
    expectedEndAt: workday.expectedEndAt,
    scheduledStart,
    scheduledEnd,
  });
};

/**
 * Builds a deterministic release plan shared by preview and transactional execution.
 * Past workdays are never mutated. History closes via validUntil (inclusive).
 */
export const buildDeactivationReleasePlan = (input: {
  assignments: DeactivationAssignmentSnapshot[];
  companyTodayIso: string;
  referenceAt: Date;
  timezone: string;
}): DeactivationReleasePlan => {
  const employeeWorkdayIdsToCancel: string[] = [];
  const assignmentsToCancel: string[] = [];
  const assignmentsToEnd: Array<{ assignmentId: string; effectiveDate: string }> = [];
  const affectedWorkdayRows: DeactivationImpactRow[] = [];
  const affectedAssignmentIds: string[] = [];

  for (const assignment of input.assignments) {
    if (
      !isAssignmentPeriodOpen({
        validFrom: assignment.validFrom,
        validUntil: assignment.validUntil,
        cancelledAt: assignment.cancelledAt,
        companyTodayIso: input.companyTodayIso,
      })
    ) {
      continue;
    }

    if (
      assignment.operationStatus === "CANCELLED" ||
      assignment.operationStatus === "COMPLETED"
    ) {
      continue;
    }

    const cancellableWorkdays = assignment.workdays.filter((workday) =>
      isCancellableWorkday(
        workday,
        input.companyTodayIso,
        input.referenceAt,
        assignment.operationStatus,
        assignment.operationKind,
        assignment.scheduledStart,
        assignment.scheduledEnd,
      ),
    );

    const unmaterializedFuture =
      assignment.workdays.length === 0 &&
      hasOperationalTemporalImpact({
        operationStatus: assignment.operationStatus,
        operationKind: assignment.operationKind,
        companyTodayIso: input.companyTodayIso,
        referenceAt: input.referenceAt,
        workDate: null,
        expectedStartAt: null,
        expectedEndAt: null,
        scheduledStart: assignment.scheduledStart,
        scheduledEnd: assignment.scheduledEnd,
      });

    if (cancellableWorkdays.length === 0 && !unmaterializedFuture) {
      continue;
    }

    affectedAssignmentIds.push(assignment.assignmentId);

    for (const workday of cancellableWorkdays) {
      employeeWorkdayIdsToCancel.push(workday.employeeWorkdayId);
      affectedWorkdayRows.push({
        assignmentId: assignment.assignmentId,
        operationId: assignment.operationId,
        operationName: resolveOperationDisplayName({
          notes: assignment.operationNotes,
          locationName: assignment.locationName,
          date: workday.workDate,
          scheduledStart: assignment.scheduledStart,
        }),
        operationType: assignment.operationKind,
        workdayId: workday.operationWorkdayId,
        employeeWorkdayId: workday.employeeWorkdayId,
        date: workday.workDate,
        startTime: formatClockInTimezone(workday.expectedStartAt, input.timezone),
        endTime: formatClockInTimezone(workday.expectedEndAt, input.timezone),
        status: assignment.operationStatus,
        locationName: assignment.locationName,
        workTeamName: assignment.workTeamName,
      });
    }

    if (unmaterializedFuture) {
      affectedWorkdayRows.push({
        assignmentId: assignment.assignmentId,
        operationId: assignment.operationId,
        operationName: resolveOperationDisplayName({
          notes: assignment.operationNotes,
          locationName: assignment.locationName,
          date: assignment.validFrom,
          scheduledStart: assignment.scheduledStart,
        }),
        operationType: assignment.operationKind,
        workdayId: null,
        employeeWorkdayId: null,
        date: assignment.validFrom >= input.companyTodayIso ? assignment.validFrom : null,
        startTime: formatClockInTimezone(assignment.scheduledStart, input.timezone),
        endTime: formatClockInTimezone(assignment.scheduledEnd, input.timezone),
        status: assignment.operationStatus,
        locationName: assignment.locationName,
        workTeamName: assignment.workTeamName,
      });
    }

    const hasHistory = assignmentHasHistory(assignment, input.companyTodayIso);
    if (!hasHistory) {
      assignmentsToCancel.push(assignment.assignmentId);
      continue;
    }

    // Inclusive validUntil: keep today when it already has attendance; otherwise end yesterday.
    const keepToday = assignment.workdays.some(
      (workday) => workday.workDate === input.companyTodayIso && workday.hasAttendance,
    );
    const effectiveDate = keepToday
      ? input.companyTodayIso
      : addDaysToDateIso(input.companyTodayIso, -1);

    if (assignment.validFrom > effectiveDate) {
      // Period would become invalid; cancel instead (no remaining historical coverage).
      assignmentsToCancel.push(assignment.assignmentId);
      continue;
    }

    if (!assignment.validUntil || assignment.validUntil > effectiveDate) {
      assignmentsToEnd.push({ assignmentId: assignment.assignmentId, effectiveDate });
    }
  }

  return {
    employeeWorkdayIdsToCancel: [...new Set(employeeWorkdayIdsToCancel)],
    assignmentsToCancel: [...new Set(assignmentsToCancel)],
    assignmentsToEnd,
    affectedWorkdayRows,
    affectedAssignmentIds: [...new Set(affectedAssignmentIds)],
  };
};

export const summarizeDeactivationImpact = (input: {
  plan: DeactivationReleasePlan;
  workTeamCount: number;
}): {
  affectedAssignmentsCount: number;
  affectedWorkdaysCount: number;
  requiresConfirmation: boolean;
  canDeactivateDirectly: boolean;
} => {
  const affectedAssignmentsCount = input.plan.affectedAssignmentIds.length;
  const affectedWorkdaysCount = input.plan.affectedWorkdayRows.length;
  const requiresConfirmation = affectedAssignmentsCount > 0 || input.workTeamCount > 0;

  return {
    affectedAssignmentsCount,
    affectedWorkdaysCount,
    requiresConfirmation,
    canDeactivateDirectly: !requiresConfirmation,
  };
};
