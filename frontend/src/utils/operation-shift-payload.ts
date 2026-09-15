import type { CreateOperationInput, CreateOperationShiftSeedInput } from "../types/operation";
import type { ScheduleMode } from "../types/operation-shift";
import type { CompanyWorkSchedule, Weekday } from "../types/schedule";
import type { OperationFormValues } from "../schemas/operation.schema";
import { datetimeLocalToIso } from "./dates";

const WEEKDAY_TO_ISO: Record<Weekday, number> = {
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
  SUNDAY: 7,
};

const FALLBACK_WORKING_ISO_DAYS = [1, 2, 3, 4, 5];

/**
 * ISO weekdays (1=Mon … 7=Sun) marked laborable on the company weekly schedule.
 * Falls back to Mon–Fri when the company schedule is missing.
 */
export function getCompanyWorkingIsoDays(
  schedule: CompanyWorkSchedule | null | undefined,
): number[] {
  if (!schedule?.days?.length) {
    return [...FALLBACK_WORKING_ISO_DAYS];
  }

  const days = schedule.days
    .filter((day) => day.isEnabled)
    .map((day) => WEEKDAY_TO_ISO[day.dayOfWeek])
    .filter((day): day is number => typeof day === "number")
    .sort((left, right) => left - right);

  return days.length > 0 ? days : [...FALLBACK_WORKING_ISO_DAYS];
}

export type AssignEmployeePayloadInput = {
  employeeId: string;
  validFrom?: string;
  validUntil?: string | null;
  operationShiftId?: string | null;
  asCoverage?: boolean;
  replacedAssignmentId?: string;
  replacedEmployeeId?: string;
  coverageReason?: string;
};

export type AssignEmployeesBatchPayloadInput = {
  employeeIds: string[];
  validFrom?: string;
  validUntil?: string | null;
  operationShiftId?: string | null;
};

/**
 * Builds assign payload for SINGLE vs MULTI_SHIFT.
 * MULTI_SHIFT requires operationShiftId; SINGLE omits it (or sends null).
 */
export function buildAssignEmployeePayload(
  scheduleMode: ScheduleMode | undefined,
  input: AssignEmployeePayloadInput,
): AssignEmployeePayloadInput {
  const mode = scheduleMode ?? "SINGLE";
  const base: AssignEmployeePayloadInput = {
    employeeId: input.employeeId,
    ...(input.validFrom !== undefined ? { validFrom: input.validFrom } : {}),
    ...(input.validUntil !== undefined ? { validUntil: input.validUntil } : {}),
  };

  if (input.asCoverage) {
    return {
      ...base,
      asCoverage: true,
      replacedAssignmentId: input.replacedAssignmentId,
      ...(input.replacedEmployeeId !== undefined
        ? { replacedEmployeeId: input.replacedEmployeeId }
        : {}),
      ...(input.coverageReason !== undefined ? { coverageReason: input.coverageReason } : {}),
      ...(input.operationShiftId !== undefined
        ? { operationShiftId: input.operationShiftId }
        : {}),
    };
  }

  if (mode === "MULTI_SHIFT") {
    return {
      ...base,
      operationShiftId: input.operationShiftId ?? null,
    };
  }

  return base;
}

export function buildAssignEmployeesBatchPayload(
  scheduleMode: ScheduleMode | undefined,
  input: AssignEmployeesBatchPayloadInput,
): AssignEmployeesBatchPayloadInput {
  const mode = scheduleMode ?? "SINGLE";
  const base: AssignEmployeesBatchPayloadInput = {
    employeeIds: input.employeeIds,
    ...(input.validFrom !== undefined ? { validFrom: input.validFrom } : {}),
    ...(input.validUntil !== undefined ? { validUntil: input.validUntil } : {}),
  };

  if (mode === "MULTI_SHIFT") {
    return {
      ...base,
      operationShiftId: input.operationShiftId ?? null,
    };
  }

  return base;
}

/** True when end is earlier than start (overnight / crosses midnight). */
export function isOvernightShift(startTime: string, endTime: string): boolean {
  const start = normalizeHhMm(startTime);
  const end = normalizeHhMm(endTime);
  if (!start || !end) {
    return false;
  }
  return end < start;
}

function normalizeHhMm(value: string): string | null {
  const trimmed = value.trim();
  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(trimmed);
  if (!match) {
    return null;
  }
  return `${match[1]}:${match[2]}`;
}

function toCreateShiftSeeds(values: OperationFormValues): CreateOperationShiftSeedInput[] {
  return values.shifts.map((shift, index) => {
    const seed: CreateOperationShiftSeedInput = {
      code: shift.code.trim(),
      name: shift.name.trim(),
      startTime: shift.startTime,
      endTime: shift.endTime,
      sortOrder: index,
      ...(shift.templateId ? { templateId: shift.templateId } : {}),
    };
    if (values.operationKind === "RECURRING" && shift.enabledDays?.length) {
      seed.days = [1, 2, 3, 4, 5, 6, 7].map((dayOfWeek) => ({
        dayOfWeek,
        isEnabled: shift.enabledDays!.includes(dayOfWeek),
      }));
    }
    return seed;
  });
}

/**
 * Builds create-operation API payload.
 * SINGLE omits scheduleMode MULTI fields and never sends empty shifts[].
 * MULTI sends scheduleMode + shifts[].
 */
export function buildCreateOperationPayload(values: OperationFormValues): CreateOperationInput {
  const shared = {
    serviceId: values.serviceId,
    earlyToleranceMinutes:
      values.earlyToleranceSource === "CUSTOM" ? values.earlyToleranceMinutes : null,
    lateToleranceMinutes:
      values.lateToleranceSource === "CUSTOM" ? values.lateToleranceMinutes : null,
  };

  const multiFields =
    values.scheduleMode === "MULTI_SHIFT"
      ? {
          scheduleMode: "MULTI_SHIFT" as const,
          shifts: toCreateShiftSeeds(values),
        }
      : {};

  if (values.operationKind === "RECURRING") {
    return {
      operationKind: "RECURRING",
      ...shared,
      ...multiFields,
      validFrom: values.validFrom,
      validUntil: values.validUntil?.trim() ? values.validUntil : null,
      scheduleSource: values.scheduleSource,
      ...(values.scheduleSource === "CUSTOM"
        ? {
            scheduleDays: values.scheduleDays.map((day) => ({
              dayOfWeek: day.dayOfWeek,
              isEnabled: day.isEnabled,
              startTime: day.startTime ?? null,
              endTime: day.endTime ?? null,
            })),
          }
        : {}),
    };
  }

  return {
    operationKind: "ONE_TIME",
    ...shared,
    ...multiFields,
    scheduledStart: datetimeLocalToIso(values.scheduledStart),
    scheduledEnd: values.scheduledEnd ? datetimeLocalToIso(values.scheduledEnd) : null,
  };
}
