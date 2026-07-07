import type { DerivedEmployeeWorkdayState } from "../types/employee-workday-state";
import {
  calculateAbsenceRate,
  calculateAttendanceRate,
  calculatePunctualityRate,
  deriveWorkdayStateCounts,
  type WorkdayStateCounts,
} from "./attendance-statistics-metrics";
import { deriveEmployeeWorkdayState } from "./derive-employee-workday-state";
import { selectCanonicalProductionAttendance } from "./statistics-canonical-attendance";

export interface AnalyticalWorkdayInput {
  employeeWorkdayId: string;
  expectationStatus: "EXPECTED" | "JUSTIFIED" | "CANCELLED";
  expectedStartAt: string;
  expectedEndAt: string | null;
  earlyToleranceMinutes: number;
  lateToleranceMinutes: number;
  workDate: string;
  operationKind?: "ONE_TIME" | "RECURRING";
  attendanceRecords?: Array<{
    id: string;
    validationStatus: string;
    receivedAt: Date;
    checkoutAt?: Date | null;
    punctualityStatus?: string | null;
    extraWorkedMinutes?: number;
    isSimulation: boolean;
  }>;
}

export interface AnalyticalProjectionRow {
  employeeWorkdayId: string;
  workDate: string;
  effectiveState: DerivedEmployeeWorkdayState;
  workedMinutes: number;
  overtimeMinutes: number;
  isOnTimeWorkday: boolean;
  isLateWorkday: boolean;
  operationKind?: "ONE_TIME" | "RECURRING";
}

const calculateWorkedMinutes = (receivedAt: Date, checkoutAt: Date | null | undefined): number => {
  if (!checkoutAt) {
    return 0;
  }

  return Math.max(0, Math.round((checkoutAt.getTime() - receivedAt.getTime()) / 60_000));
};

export const buildAnalyticalProjectionRow = (
  input: AnalyticalWorkdayInput,
  referenceAt: Date,
): AnalyticalProjectionRow => {
  const canonical = selectCanonicalProductionAttendance(
    (input.attendanceRecords ?? []).map((record) => ({
      id: record.id,
      validationStatus: record.validationStatus,
      receivedAt: record.receivedAt,
      isSimulation: record.isSimulation,
    })),
  );

  const matchedAttendance = canonical
    ? (input.attendanceRecords ?? []).find((record) => record.id === canonical.id)
    : undefined;

  const effectiveState = deriveEmployeeWorkdayState({
    employeeWorkday: { expectationStatus: input.expectationStatus },
    hasAttendance: Boolean(matchedAttendance),
    expectedStartAt: input.expectedStartAt,
    expectedEndAt: input.expectedEndAt,
    earlyToleranceMinutes: input.earlyToleranceMinutes,
    lateToleranceMinutes: input.lateToleranceMinutes,
    referenceAt,
  });

  const workedMinutes =
    matchedAttendance && matchedAttendance.checkoutAt
      ? calculateWorkedMinutes(matchedAttendance.receivedAt, matchedAttendance.checkoutAt)
      : 0;
  const overtimeMinutes = matchedAttendance?.extraWorkedMinutes ?? 0;
  const punctualityStatus = matchedAttendance?.punctualityStatus ?? null;

  return {
    employeeWorkdayId: input.employeeWorkdayId,
    workDate: input.workDate,
    effectiveState,
    workedMinutes,
    overtimeMinutes,
    isOnTimeWorkday: punctualityStatus === "ON_TIME" || punctualityStatus === "EARLY",
    isLateWorkday: punctualityStatus === "LATE",
    operationKind: input.operationKind,
  };
};

export const aggregateProjectionSummary = (
  rows: AnalyticalProjectionRow[],
): WorkdayStateCounts & {
  attendanceRate: number;
  absenceRate: number;
  onTimeWorkdays: number;
  lateWorkdays: number;
  punctualityRate: number;
  workedMinutes: number;
  overtimeMinutes: number;
} => {
  const counts = deriveWorkdayStateCounts(rows.map((row) => row.effectiveState));
  const onTimeWorkdays = rows.filter((row) => row.isOnTimeWorkday).length;
  const lateWorkdays = rows.filter((row) => row.isLateWorkday).length;

  return {
    ...counts,
    attendanceRate: calculateAttendanceRate(counts.presentWorkdays, counts.absentWorkdays),
    absenceRate: calculateAbsenceRate(counts.presentWorkdays, counts.absentWorkdays),
    onTimeWorkdays,
    lateWorkdays,
    punctualityRate: calculatePunctualityRate(onTimeWorkdays, lateWorkdays),
    workedMinutes: rows.reduce((total, row) => total + row.workedMinutes, 0),
    overtimeMinutes: rows.reduce((total, row) => total + row.overtimeMinutes, 0),
  };
};

export const aggregateEmployeeAttendanceRates = (
  rows: AnalyticalProjectionRow[],
  employeeId: string,
  employeeWorkdayIds: string[],
): number => {
  const employeeRows = rows.filter((row) => employeeWorkdayIds.includes(row.employeeWorkdayId));
  const present = employeeRows.filter((row) => row.effectiveState === "PRESENT").length;
  const absent = employeeRows.filter((row) => row.effectiveState === "ABSENT").length;
  return calculateAttendanceRate(present, absent);
};

export const aggregateCompanyAttendanceRate = (rows: AnalyticalProjectionRow[]): number => {
  const present = rows.filter((row) => row.effectiveState === "PRESENT").length;
  const absent = rows.filter((row) => row.effectiveState === "ABSENT").length;
  return calculateAttendanceRate(present, absent);
};
