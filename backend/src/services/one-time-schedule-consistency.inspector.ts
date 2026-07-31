import { companySettingsRepository } from "../repositories/company-settings.repository";
import { operationEmployeeRepository } from "../repositories/operation-employee.repository";
import { operationRepository } from "../repositories/operation.repository";
import { operationWorkdayRepository } from "../repositories/operation-workday.repository";
import { employeeWorkdayRepository } from "../repositories/employee-workday.repository";
import { getPool } from "../database/connection";
import sql from "mssql";
import type { Operation } from "../types/domain";
import type { OperationWorkday } from "../types/workday";
import { resolveOperationTimezone } from "../utils/operation-timezone";
import { operationWorkdayResolver } from "./operation-workday-resolver";

export type OneTimeConsistencyStatus =
  | "consistent"
  | "repairable"
  | "blocked"
  | "missing_operation"
  | "not_one_time";

export type OneTimeConsistencyReasonCode =
  | "MISSING_OPERATION_WORKDAY_WITH_ASSIGNMENTS"
  | "MULTIPLE_OPERATION_WORKDAYS"
  | "WORK_DATE_MISMATCH"
  | "EXPECTED_START_MISMATCH"
  | "EXPECTED_END_MISMATCH"
  | "TOLERANCE_MISMATCH"
  | "TIMEZONE_SNAPSHOT_MISMATCH"
  | "WORKDAY_STATUS_NOT_ACTIVE"
  | "ASSIGNMENT_VALIDITY_MISMATCH"
  | "ACTIVE_ASSIGNMENT_WITHOUT_EMPLOYEE_WORKDAY"
  | "DUPLICATE_EMPLOYEE_WORKDAY"
  | "LOCKED_BY_ATTENDANCE"
  | "ORPHAN_PENDING_NOTIFICATION_ON_DRIFT";

export type OneTimeScheduleConsistencyReport = {
  status: OneTimeConsistencyStatus;
  reasonCodes: OneTimeConsistencyReasonCode[];
  repairable: boolean;
  blockedReason: string | null;
  companyId: string;
  operationId: string;
  current: {
    scheduledStart: string | null;
    scheduledEnd: string | null;
    earlyToleranceMinutes: number;
    lateToleranceMinutes: number;
    workdays: Array<{
      id: string;
      workDate: string;
      expectedStartAt: string;
      expectedEndAt: string | null;
      earlyToleranceMinutes: number;
      lateToleranceMinutes: number;
      scheduleVersion: number;
      scheduleTimezoneSnapshot: string | null;
      status: string;
    }>;
    assignments: Array<{
      id: string;
      employeeId: string;
      validFrom: string;
      validUntil: string | null;
      cancelledAt: string | null;
    }>;
  };
  expected: {
    workDate: string;
    expectedStartAt: string;
    expectedEndAt: string | null;
    earlyToleranceMinutes: number;
    lateToleranceMinutes: number;
    timezone: string;
  } | null;
  affectedIds: {
    operationWorkdayIds: string[];
    assignmentIds: string[];
    employeeWorkdayIds: string[];
    employeeIdsMissingWorkday: string[];
  };
};

const sameInstant = (left: string | null | undefined, right: Date | null): boolean => {
  if (left == null && right == null) {
    return true;
  }
  if (left == null || right == null) {
    return false;
  }
  return new Date(left).getTime() === right.getTime();
};

const mapWorkday = (workday: OperationWorkday) => ({
  id: workday.id,
  workDate: workday.workDate,
  expectedStartAt: workday.expectedStartAt,
  expectedEndAt: workday.expectedEndAt,
  earlyToleranceMinutes: workday.earlyToleranceMinutes,
  lateToleranceMinutes: workday.lateToleranceMinutes,
  scheduleVersion: workday.scheduleVersion,
  scheduleTimezoneSnapshot: workday.scheduleTimezoneSnapshot,
  status: workday.status,
});

/**
 * Canonical ONE_TIME schedule consistency inspection shared by CLI dry-run/apply
 * and repair orchestration. Single definition of drift.
 */
export const oneTimeScheduleConsistencyInspector = {
  async inspect(
    companyId: string,
    operationId: string,
  ): Promise<OneTimeScheduleConsistencyReport> {
    const operation = await operationRepository.findById(companyId, operationId);
    if (!operation) {
      return {
        status: "missing_operation",
        reasonCodes: [],
        repairable: false,
        blockedReason: "OPERATION_NOT_FOUND",
        companyId,
        operationId,
        current: {
          scheduledStart: null,
          scheduledEnd: null,
          earlyToleranceMinutes: 0,
          lateToleranceMinutes: 0,
          workdays: [],
          assignments: [],
        },
        expected: null,
        affectedIds: {
          operationWorkdayIds: [],
          assignmentIds: [],
          employeeWorkdayIds: [],
          employeeIdsMissingWorkday: [],
        },
      };
    }

    return this.inspectOperation(companyId, operation);
  },

  async inspectOperation(
    companyId: string,
    operation: Operation,
  ): Promise<OneTimeScheduleConsistencyReport> {
    const operationId = operation.id;
    if ((operation.operationKind ?? "ONE_TIME") !== "ONE_TIME") {
      return {
        status: "not_one_time",
        reasonCodes: [],
        repairable: false,
        blockedReason: "NOT_ONE_TIME",
        companyId,
        operationId,
        current: {
          scheduledStart: operation.scheduledStart,
          scheduledEnd: operation.scheduledEnd,
          earlyToleranceMinutes: operation.earlyToleranceMinutes,
          lateToleranceMinutes: operation.lateToleranceMinutes,
          workdays: [],
          assignments: [],
        },
        expected: null,
        affectedIds: {
          operationWorkdayIds: [],
          assignmentIds: [],
          employeeWorkdayIds: [],
          employeeIdsMissingWorkday: [],
        },
      };
    }

    const settings = await companySettingsRepository.findByCompanyId(companyId);
    const timezone = resolveOperationTimezone(settings?.operationTimezone);
    const resolved = operationWorkdayResolver.resolveOneTime(operation, timezone);
    const workdays = await operationWorkdayRepository.listByOperationId(companyId, operationId);
    const assignments = await operationEmployeeRepository.listByOperation(companyId, operationId);
    const activeAssignments = assignments.filter((row) => !row.cancelledAt);

    const reasonCodes = new Set<OneTimeConsistencyReasonCode>();
    const employeeIdsMissingWorkday: string[] = [];
    const employeeWorkdayIds: string[] = [];

    if (workdays.length > 1) {
      reasonCodes.add("MULTIPLE_OPERATION_WORKDAYS");
    }

    const workday = workdays[0] ?? null;
    if (!workday && activeAssignments.length > 0) {
      reasonCodes.add("MISSING_OPERATION_WORKDAY_WITH_ASSIGNMENTS");
    }

    if (workday) {
      if (workday.workDate !== resolved.workDate) {
        reasonCodes.add("WORK_DATE_MISMATCH");
      }
      if (!sameInstant(workday.expectedStartAt, resolved.expectedStartAt)) {
        reasonCodes.add("EXPECTED_START_MISMATCH");
      }
      if (!sameInstant(workday.expectedEndAt, resolved.expectedEndAt)) {
        reasonCodes.add("EXPECTED_END_MISMATCH");
      }
      if (workday.earlyToleranceMinutes !== resolved.earlyToleranceMinutes) {
        reasonCodes.add("TOLERANCE_MISMATCH");
      }
      if (workday.lateToleranceMinutes !== resolved.lateToleranceMinutes) {
        reasonCodes.add("TOLERANCE_MISMATCH");
      }
      if ((workday.scheduleTimezoneSnapshot ?? timezone) !== timezone) {
        reasonCodes.add("TIMEZONE_SNAPSHOT_MISMATCH");
      }
      if (workday.status !== "ACTIVE") {
        reasonCodes.add("WORKDAY_STATUS_NOT_ACTIVE");
      }

      for (const assignment of activeAssignments) {
        if (
          assignment.validFrom !== resolved.workDate ||
          assignment.validUntil !== resolved.workDate
        ) {
          reasonCodes.add("ASSIGNMENT_VALIDITY_MISMATCH");
        }

        const existing = await employeeWorkdayRepository.findByWorkdayAndEmployee(
          companyId,
          workday.id,
          assignment.employeeId,
        );
        if (!existing) {
          reasonCodes.add("ACTIVE_ASSIGNMENT_WITHOUT_EMPLOYEE_WORKDAY");
          employeeIdsMissingWorkday.push(assignment.employeeId);
        } else {
          employeeWorkdayIds.push(existing.id);
        }
      }

      const duplicateCheck = await getPool()
        .request()
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("operationWorkdayId", sql.UniqueIdentifier, workday.id)
        .query(`
          SELECT employee_id, COUNT(*) AS total
          FROM employee_workdays
          WHERE company_id = @companyId
            AND operation_workday_id = @operationWorkdayId
          GROUP BY employee_id
          HAVING COUNT(*) > 1
        `);
      if (duplicateCheck.recordset.length > 0) {
        reasonCodes.add("DUPLICATE_EMPLOYEE_WORKDAY");
      }

      const hasAttendance = await operationWorkdayRepository.hasAttendanceForWorkday(
        companyId,
        workday.id,
      );
      const wouldChangeTimingOrDate =
        workday.workDate !== resolved.workDate ||
        !sameInstant(workday.expectedStartAt, resolved.expectedStartAt) ||
        !sameInstant(workday.expectedEndAt, resolved.expectedEndAt);
      if (hasAttendance && wouldChangeTimingOrDate) {
        reasonCodes.add("LOCKED_BY_ATTENDANCE");
      }
    } else {
      for (const assignment of activeAssignments) {
        if (
          assignment.validFrom !== resolved.workDate ||
          assignment.validUntil !== resolved.workDate
        ) {
          reasonCodes.add("ASSIGNMENT_VALIDITY_MISMATCH");
        }
      }
    }

    const codes = [...reasonCodes].sort();
    const blocked =
      codes.includes("MULTIPLE_OPERATION_WORKDAYS") ||
      codes.includes("LOCKED_BY_ATTENDANCE") ||
      codes.includes("DUPLICATE_EMPLOYEE_WORKDAY");
    const hasDrift = codes.length > 0;

    let status: OneTimeConsistencyStatus = "consistent";
    let blockedReason: string | null = null;
    if (blocked) {
      status = "blocked";
      blockedReason = codes.includes("LOCKED_BY_ATTENDANCE")
        ? "OPERATION_SCHEDULE_LOCKED_BY_ATTENDANCE"
        : codes.includes("MULTIPLE_OPERATION_WORKDAYS")
          ? "ONE_TIME_OPERATION_MULTIPLE_WORKDAYS"
          : "DUPLICATE_EMPLOYEE_WORKDAY";
    } else if (hasDrift) {
      status = "repairable";
    }

    return {
      status,
      reasonCodes: codes,
      repairable: status === "repairable",
      blockedReason,
      companyId,
      operationId,
      current: {
        scheduledStart: operation.scheduledStart,
        scheduledEnd: operation.scheduledEnd,
        earlyToleranceMinutes: operation.earlyToleranceMinutes,
        lateToleranceMinutes: operation.lateToleranceMinutes,
        workdays: workdays.map(mapWorkday),
        assignments: assignments.map((row) => ({
          id: row.id,
          employeeId: row.employeeId,
          validFrom: row.validFrom,
          validUntil: row.validUntil,
          cancelledAt: row.cancelledAt ?? null,
        })),
      },
      expected: {
        workDate: resolved.workDate,
        expectedStartAt: resolved.expectedStartAt.toISOString(),
        expectedEndAt: resolved.expectedEndAt?.toISOString() ?? null,
        earlyToleranceMinutes: resolved.earlyToleranceMinutes,
        lateToleranceMinutes: resolved.lateToleranceMinutes,
        timezone,
      },
      affectedIds: {
        operationWorkdayIds: workdays.map((row) => row.id),
        assignmentIds: activeAssignments.map((row) => row.id),
        employeeWorkdayIds,
        employeeIdsMissingWorkday,
      },
    };
  },
};
