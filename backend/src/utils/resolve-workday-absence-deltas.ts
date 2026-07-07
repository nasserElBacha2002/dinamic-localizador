import type { AbsenceWorkdayReconciliationResult } from "../types/absence-workday-reconciliation";
import type { EmployeeWorkday } from "../types/workday";
import type { AbsenceCoverageInput, WorkdayAbsenceScheduleContext } from "./resolve-effective-absence-for-workday";
import { resolveEffectiveAbsenceForWorkday } from "./resolve-effective-absence-for-workday";

export type EmployeeWorkdayWithSchedule = EmployeeWorkday &
  WorkdayAbsenceScheduleContext & {
    earlyToleranceMinutes: number;
    lateToleranceMinutes: number;
  };

export type JustifyDelta = {
  employeeWorkdayId: string;
  absenceRequestId: string;
};

export type RelinkDelta = {
  employeeWorkdayId: string;
  currentAbsenceRequestId: string;
  nextAbsenceRequestId: string;
};

export type RestoreDelta = {
  employeeWorkdayId: string;
  absenceRequestId: string;
};

export type WorkdayAbsenceResolution = {
  toJustify: JustifyDelta[];
  toRelink: RelinkDelta[];
  toRestore: RestoreDelta[];
  attendanceConflicts: number;
  unchanged: number;
};

const buildAbsenceIndex = <T extends AbsenceCoverageInput>(
  absences: T[],
): Map<string, T[]> => {
  const index = new Map<string, T[]>();
  for (const absence of absences) {
    const existing = index.get(absence.employeeId) ?? [];
    existing.push(absence);
    index.set(absence.employeeId, existing);
  }
  return index;
};

export const resolveWorkdayAbsenceDeltas = <T extends AbsenceCoverageInput>(input: {
  workdays: EmployeeWorkdayWithSchedule[];
  absences: T[];
  attendanceEmployeeWorkdayIds: Set<string>;
}): WorkdayAbsenceResolution => {
  const resolution: WorkdayAbsenceResolution = {
    toJustify: [],
    toRelink: [],
    toRestore: [],
    attendanceConflicts: 0,
    unchanged: 0,
  };

  const absenceIndex = buildAbsenceIndex(input.absences);

  for (const workday of input.workdays) {
    if (workday.expectationStatus === "CANCELLED") {
      resolution.unchanged += 1;
      continue;
    }

    const employeeAbsences = absenceIndex.get(workday.employeeId) ?? [];
    const effectiveAbsence = resolveEffectiveAbsenceForWorkday({
      workday,
      approvedAbsences: employeeAbsences,
    });
    const hasAttendance = input.attendanceEmployeeWorkdayIds.has(workday.id);

    if (effectiveAbsence) {
      if (hasAttendance) {
        resolution.attendanceConflicts += 1;
        resolution.unchanged += 1;
        continue;
      }

      if (workday.expectationStatus === "JUSTIFIED") {
        if (workday.absenceRequestId === effectiveAbsence.id) {
          resolution.unchanged += 1;
          continue;
        }

        resolution.toRelink.push({
          employeeWorkdayId: workday.id,
          currentAbsenceRequestId: workday.absenceRequestId ?? "",
          nextAbsenceRequestId: effectiveAbsence.id,
        });
        continue;
      }

      if (workday.expectationStatus !== "EXPECTED") {
        resolution.unchanged += 1;
        continue;
      }

      resolution.toJustify.push({
        employeeWorkdayId: workday.id,
        absenceRequestId: effectiveAbsence.id,
      });
      continue;
    }

    if (workday.expectationStatus === "JUSTIFIED" && workday.absenceRequestId) {
      resolution.toRestore.push({
        employeeWorkdayId: workday.id,
        absenceRequestId: workday.absenceRequestId,
      });
      continue;
    }

    resolution.unchanged += 1;
  }

  return resolution;
};

export const applyPersistedAbsenceDeltas = (
  persisted: {
    justified: number;
    relinked: number;
    restored: number;
    justifyRaceConflicts: number;
  },
  resolution: WorkdayAbsenceResolution,
): AbsenceWorkdayReconciliationResult => ({
  justified: persisted.justified,
  relinked: persisted.relinked,
  restored: persisted.restored,
  attendanceConflicts: resolution.attendanceConflicts + persisted.justifyRaceConflicts,
  unchanged:
    resolution.unchanged +
    (resolution.toJustify.length - persisted.justified - persisted.justifyRaceConflicts) +
    (resolution.toRelink.length - persisted.relinked) +
    (resolution.toRestore.length - persisted.restored),
});
