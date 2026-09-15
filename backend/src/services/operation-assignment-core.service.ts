import sql from "mssql";
import { AppError } from "../errors/app-error";
import type { WorkTeamAssignmentSkipReason } from "../constants/work-team-assignment";
import { companySettingsRepository } from "../repositories/company-settings.repository";
import { employeeWorkdayRepository } from "../repositories/employee-workday.repository";
import { operationAssignmentNotificationRepository } from "../repositories/operation-assignment-notification.repository";
import { operationEmployeeRepository } from "../repositories/operation-employee.repository";
import { operationShiftVersionRepository } from "../repositories/operation-shift-version.repository";
import { operationWorkdayRepository } from "../repositories/operation-workday.repository";
import type { OperationEmployeeAssignment } from "../types/domain";
import {
  assertValidAssignmentDateRange,
  assignmentPeriodsOverlap,
  isAssignmentActiveOnWorkDate,
} from "../utils/assignment-period";
import {
  employeeShiftIntervalOverlap,
  type CrossOperationShiftOverlapWarning,
} from "../utils/employee-shift-interval-overlap";
import { assertAssignmentShiftMatchesScheduleMode } from "../utils/operation-schedule-mode-guard";
import { resolveVersionForDate } from "../utils/operation-shift-version-resolver";
import { resolveOperationTimezone } from "../utils/operation-timezone";
import { addDaysToDateIso, compareDateIso } from "../utils/recurring-workday-instant";
import { workdayMaterializationService } from "./workday-materialization.service";

export type AssignEmployeeInTransactionOutcome =
  | {
      outcome: "added";
      assignment: OperationEmployeeAssignment;
      crossOperationShiftOverlapWarnings?: CrossOperationShiftOverlapWarning[];
    }
  | {
      outcome: "skipped";
      reason: WorkTeamAssignmentSkipReason;
      existingAssignmentId?: string;
    };

const periodsAreEquivalent = (
  leftFrom: string,
  leftUntil: string | null,
  rightFrom: string,
  rightUntil: string | null,
): boolean => leftFrom === rightFrom && leftUntil === rightUntil;

export const classifyAssignmentOverlap = (
  existing: OperationEmployeeAssignment,
  validFrom: string,
  validUntil: string | null,
): WorkTeamAssignmentSkipReason => {
  const conflict = assignmentPeriodsOverlap({
    existing,
    requested: { validFrom, validUntil },
  });
  if (conflict === "already_assigned") {
    return "already_assigned";
  }
  return "assignment_period_overlap";
};

const iterateOverlapDates = (validFrom: string, validUntil: string | null, capDays = 14): string[] => {
  const end = validUntil ?? addDaysToDateIso(validFrom, capDays - 1);
  const dates: string[] = [];
  let current = validFrom;
  while (compareDateIso(current, end) <= 0 && dates.length < capDays) {
    dates.push(current);
    current = addDaysToDateIso(current, 1);
  }
  return dates;
};

const resolveShiftTimesForDate = async (
  companyId: string,
  operationShiftId: string,
  workDate: string,
): Promise<{ startTime: string; endTime: string } | null> => {
  const versions = await operationShiftVersionRepository.listByShiftId(companyId, operationShiftId);
  const version = resolveVersionForDate(versions, workDate);
  if (!version) {
    return null;
  }
  return { startTime: version.startTime, endTime: version.endTime };
};

/**
 * Blocks same-operation overlapping shift intervals; collects cross-operation warnings.
 */
const evaluateShiftIntervalOverlaps = async (
  companyId: string,
  transaction: sql.Transaction,
  input: {
    operationId: string;
    employeeId: string;
    validFrom: string;
    validUntil: string | null;
    operationShiftId: string;
    operationWorkDate: string | null;
    timezone: string;
  },
): Promise<CrossOperationShiftOverlapWarning[]> => {
  const otherAssignments = (
    await operationEmployeeRepository.listActiveForEmployeeInTransaction(
      companyId,
      transaction,
      input.employeeId,
      { validFrom: input.validFrom, validUntil: input.validUntil },
    )
  ).filter((row) => row.operationShiftId != null);

  if (otherAssignments.length === 0) {
    return [];
  }

  const workDates = input.operationWorkDate
    ? [input.operationWorkDate]
    : iterateOverlapDates(input.validFrom, input.validUntil);

  const warnings: CrossOperationShiftOverlapWarning[] = [];
  const leftTimesByDate = new Map<string, { startTime: string; endTime: string }>();

  for (const workDate of workDates) {
    let leftTimes = leftTimesByDate.get(workDate);
    if (!leftTimes) {
      const resolved = await resolveShiftTimesForDate(companyId, input.operationShiftId, workDate);
      if (!resolved) {
        continue;
      }
      leftTimes = resolved;
      leftTimesByDate.set(workDate, leftTimes);
    }

    for (const other of otherAssignments) {
      if (!other.operationShiftId) {
        continue;
      }
      if (
        !isAssignmentActiveOnWorkDate({
          validFrom: other.validFrom,
          validUntil: other.validUntil,
          workDate,
          cancelledAt: other.cancelledAt,
        })
      ) {
        continue;
      }

      const rightTimes = await resolveShiftTimesForDate(
        companyId,
        other.operationShiftId,
        workDate,
      );
      if (!rightTimes) {
        continue;
      }

      const result = employeeShiftIntervalOverlap(
        {
          operationId: input.operationId,
          operationShiftId: input.operationShiftId,
          workDate,
          startTime: leftTimes.startTime,
          endTime: leftTimes.endTime,
          timezone: input.timezone,
        },
        {
          operationId: other.operationId,
          operationShiftId: other.operationShiftId,
          workDate,
          startTime: rightTimes.startTime,
          endTime: rightTimes.endTime,
          timezone: input.timezone,
        },
      );

      if (!result.overlaps) {
        continue;
      }
      if (result.sameOperation) {
        throw new AppError(
          409,
          "EMPLOYEE_SHIFT_TIME_OVERLAP",
          "El colaborador ya tiene un turno en esta operación que se solapa en horario.",
        );
      }
      warnings.push(result.warning);
    }
  }

  return warnings;
};

export const operationAssignmentCore = {
  async assignEmployeeInTransaction(
    companyId: string,
    transaction: sql.Transaction,
    input: {
      operationId: string;
      employeeId: string;
      validFrom: string;
      validUntil: string | null;
      employeeActive: boolean;
      operationKind: string;
      operationWorkDate: string | null;
      sourceAssignmentBatchId?: string | null;
      sourceWorkTeamId?: string | null;
      assignmentOrigin?: "MANUAL" | "WORK_TEAM" | "SYSTEM" | "COVERAGE";
      scheduleMode?: "SINGLE" | "MULTI_SHIFT";
      operationShiftId?: string | null;
    },
  ): Promise<AssignEmployeeInTransactionOutcome> {
    if (!input.employeeActive) {
      return { outcome: "skipped", reason: "employee_inactive" };
    }

    const scheduleMode = input.scheduleMode ?? "SINGLE";
    const operationShiftId = input.operationShiftId ?? null;
    assertAssignmentShiftMatchesScheduleMode(scheduleMode, operationShiftId);

    const overlap = await operationEmployeeRepository.findOverlappingInTransaction(
      companyId,
      transaction,
      {
        operationId: input.operationId,
        employeeId: input.employeeId,
        validFrom: input.validFrom,
        validUntil: input.validUntil,
        operationShiftId,
      },
    );

    if (overlap) {
      if (
        input.operationKind === "ONE_TIME" &&
        input.operationWorkDate &&
        scheduleMode === "SINGLE" &&
        periodsAreEquivalent(
          overlap.validFrom,
          overlap.validUntil,
          input.validFrom,
          input.validUntil,
        )
      ) {
        const existingWorkday = await employeeWorkdayRepository.findByOperationAndEmployeeInTransaction(
          companyId,
          transaction,
          input.operationId,
          input.employeeId,
        );
        if (!existingWorkday) {
          await workdayMaterializationService.ensureEmployeeWorkdayForAssignmentInTransaction(
            companyId,
            transaction,
            input.operationId,
            input.employeeId,
            overlap.id,
            input.operationWorkDate,
          );
        }
      }

      return {
        outcome: "skipped",
        reason: classifyAssignmentOverlap(overlap, input.validFrom, input.validUntil),
        existingAssignmentId: overlap.id,
      };
    }

    let crossOperationShiftOverlapWarnings: CrossOperationShiftOverlapWarning[] | undefined;
    if (scheduleMode === "MULTI_SHIFT" && operationShiftId) {
      const settings = await companySettingsRepository.findByCompanyId(companyId);
      const timezone = resolveOperationTimezone(settings?.operationTimezone);
      crossOperationShiftOverlapWarnings = await evaluateShiftIntervalOverlaps(
        companyId,
        transaction,
        {
          operationId: input.operationId,
          employeeId: input.employeeId,
          validFrom: input.validFrom,
          validUntil: input.validUntil,
          operationShiftId,
          operationWorkDate: input.operationWorkDate,
          timezone,
        },
      );
      if (crossOperationShiftOverlapWarnings.length === 0) {
        crossOperationShiftOverlapWarnings = undefined;
      }
    }

    const assignment = await operationEmployeeRepository.createInTransaction(
      companyId,
      transaction,
      {
        operationId: input.operationId,
        employeeId: input.employeeId,
        validFrom: input.validFrom,
        validUntil: input.validUntil,
        sourceAssignmentBatchId: input.sourceAssignmentBatchId ?? null,
        sourceWorkTeamId: input.sourceWorkTeamId ?? null,
        assignmentOrigin:
          input.assignmentOrigin ??
          (input.sourceAssignmentBatchId ? "WORK_TEAM" : "MANUAL"),
        operationShiftId,
      },
    );

    if (
      input.operationKind === "ONE_TIME" &&
      input.operationWorkDate &&
      isAssignmentActiveOnWorkDate({
        validFrom: assignment.validFrom,
        validUntil: assignment.validUntil,
        workDate: input.operationWorkDate,
      })
    ) {
      if (scheduleMode === "SINGLE") {
        await workdayMaterializationService.ensureEmployeeWorkdayForAssignmentInTransaction(
          companyId,
          transaction,
          input.operationId,
          input.employeeId,
          assignment.id,
          input.operationWorkDate,
        );
      } else if (scheduleMode === "MULTI_SHIFT" && operationShiftId) {
        const shiftWorkday =
          await operationWorkdayRepository.findByOperationWorkDateAndShiftInTransaction(
            companyId,
            transaction,
            input.operationId,
            input.operationWorkDate,
            operationShiftId,
          );
        if (!shiftWorkday) {
          throw new AppError(
            409,
            "MULTI_SHIFT_WORKDAY_NOT_MATERIALIZED",
            "Materializá las jornadas del turno antes de asignar colaboradores a una operación multi-turno.",
          );
        }
        await workdayMaterializationService.ensureEmployeeWorkdayForExistingOperationWorkdayInTransaction(
          companyId,
          transaction,
          shiftWorkday,
          input.employeeId,
          assignment.id,
        );
      }
    }

    // ONE_TIME: enqueue WhatsApp outbox in the same TX as the assignment insert.
    // Skip when we already know the period does not cover the operation work date
    // (worker still revalidates for races / missing workDate at enqueue time).
    if (input.operationKind === "ONE_TIME") {
      const coversWorkDate =
        !input.operationWorkDate ||
        isAssignmentActiveOnWorkDate({
          validFrom: assignment.validFrom,
          validUntil: assignment.validUntil,
          workDate: input.operationWorkDate,
        });
      if (coversWorkDate) {
        await operationAssignmentNotificationRepository.enqueueAssigned(
          companyId,
          assignment.id,
          input.operationId,
          input.employeeId,
          transaction,
        );
      }
    }

    return {
      outcome: "added",
      assignment,
      crossOperationShiftOverlapWarnings,
    };
  },

  resolveValidity(
    operationKind: string,
    operationWorkDate: string | null,
    input?: { validFrom?: string; validUntil?: string | null },
  ): { validFrom: string; validUntil: string | null } {
    const validFrom = input?.validFrom ?? operationWorkDate;
    const validUntil =
      input?.validUntil !== undefined
        ? input.validUntil
        : operationKind === "ONE_TIME"
          ? operationWorkDate
          : null;

    if (!validFrom) {
      throw new AppError(400, "ASSIGNMENT_VALID_FROM_REQUIRED", "La fecha de inicio es obligatoria");
    }

    try {
      assertValidAssignmentDateRange(validFrom, validUntil);
    } catch {
      throw new AppError(
        400,
        "ASSIGNMENT_INVALID_DATE_RANGE",
        "La fecha de finalización no puede ser anterior a la fecha de inicio",
      );
    }

    if (
      operationKind === "ONE_TIME" &&
      operationWorkDate &&
      !isAssignmentActiveOnWorkDate({ validFrom, validUntil, workDate: operationWorkDate })
    ) {
      throw new AppError(
        409,
        "ASSIGNMENT_OUTSIDE_OPERATION_WORK_DATE",
        "La asignación debe cubrir la fecha de la operación",
      );
    }

    return { validFrom, validUntil };
  },
};
