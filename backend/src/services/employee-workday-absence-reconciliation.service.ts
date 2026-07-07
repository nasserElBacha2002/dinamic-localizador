import { absenceRequestRepository } from "../repositories/absence-request.repository";
import { employeeWorkdayRepository } from "../repositories/employee-workday.repository";
import type { AbsenceRequest } from "../types/absence";
import {
  emptyAbsenceWorkdayReconciliationResult,
  mergeAbsenceWorkdayReconciliationResults,
  type AbsenceWorkdayReconciliationResult,
} from "../types/absence-workday-reconciliation";
import type { EmployeeWorkday } from "../types/workday";
import { isWorkDateCoveredByAbsence } from "../utils/absence-workday-coverage";

type EmployeeWorkdayWithSchedule = EmployeeWorkday & {
  workDate: string;
  expectedStartAt: string;
  expectedEndAt: string | null;
  earlyToleranceMinutes: number;
  lateToleranceMinutes: number;
};

const selectEffectiveAbsence = (
  workDate: string,
  absences: AbsenceRequest[],
): AbsenceRequest | null => {
  const covering = absences.filter((absence) => isWorkDateCoveredByAbsence(workDate, absence));
  if (covering.length === 0) {
    return null;
  }

  return covering[0] ?? null;
};

const buildAbsenceIndex = (
  absences: AbsenceRequest[],
): Map<string, AbsenceRequest[]> => {
  const index = new Map<string, AbsenceRequest[]>();
  for (const absence of absences) {
    const existing = index.get(absence.employeeId) ?? [];
    existing.push(absence);
    index.set(absence.employeeId, existing);
  }
  return index;
};

const reconcileWorkdayBatch = async (
  companyId: string,
  workdays: EmployeeWorkdayWithSchedule[],
  absences: AbsenceRequest[],
  attendanceEmployeeWorkdayIds: Set<string>,
): Promise<AbsenceWorkdayReconciliationResult> => {
  const counters = emptyAbsenceWorkdayReconciliationResult();
  const absenceIndex = buildAbsenceIndex(absences);

  for (const workday of workdays) {
    if (workday.expectationStatus === "CANCELLED") {
      counters.unchanged += 1;
      continue;
    }

    const employeeAbsences = absenceIndex.get(workday.employeeId) ?? [];
    const effectiveAbsence = selectEffectiveAbsence(workday.workDate, employeeAbsences);
    const hasAttendance = attendanceEmployeeWorkdayIds.has(workday.id);

    if (effectiveAbsence) {
      if (hasAttendance) {
        counters.attendanceConflicts += 1;
        counters.unchanged += 1;
        continue;
      }

      if (workday.expectationStatus === "JUSTIFIED") {
        if (workday.absenceRequestId === effectiveAbsence.id) {
          counters.unchanged += 1;
          continue;
        }

        const relinked = await employeeWorkdayRepository.relinkJustifiedExpectation(
          companyId,
          workday.id,
          effectiveAbsence.id,
        );
        if (relinked) {
          counters.relinked += 1;
        } else {
          counters.unchanged += 1;
        }
        continue;
      }

      if (workday.expectationStatus !== "EXPECTED") {
        counters.unchanged += 1;
        continue;
      }

      const justified = await employeeWorkdayRepository.justifyExpectation(
        companyId,
        workday.id,
        effectiveAbsence.id,
      );
      if (justified) {
        counters.justified += 1;
      } else {
        counters.unchanged += 1;
      }
      continue;
    }

    if (workday.expectationStatus === "JUSTIFIED") {
      const restored = await employeeWorkdayRepository.restoreJustifiedExpectation(
        companyId,
        workday.id,
        workday.absenceRequestId ?? "",
      );
      if (restored) {
        counters.restored += 1;
      } else {
        counters.unchanged += 1;
      }
      continue;
    }

    counters.unchanged += 1;
  }

  return counters;
};

export const employeeWorkdayAbsenceReconciliationService = {
  async reconcileForApprovedAbsence(
    companyId: string,
    absenceRequestId: string,
  ): Promise<AbsenceWorkdayReconciliationResult> {
    const absence = await absenceRequestRepository.findById(companyId, absenceRequestId);
    if (!absence || absence.status !== "APPROVED") {
      return emptyAbsenceWorkdayReconciliationResult();
    }

    return this.reconcileEmployeeDateRange(
      companyId,
      absence.employeeId,
      absence.startDate,
      absence.endDate,
    );
  },

  async reconcileForRevokedAbsence(
    companyId: string,
    absenceRequestId: string,
  ): Promise<AbsenceWorkdayReconciliationResult> {
    const linkedWorkdays = await employeeWorkdayRepository.listWithWorkDatesByAbsenceRequestId(
      companyId,
      absenceRequestId,
    );

    if (linkedWorkdays.length === 0) {
      return emptyAbsenceWorkdayReconciliationResult();
    }

    const attendanceIds = await employeeWorkdayRepository.listAttendancePresenceForEmployeeWorkdayIds(
      companyId,
      linkedWorkdays.map((workday) => workday.id),
    );

    const absence = await absenceRequestRepository.findById(companyId, absenceRequestId);
    const employeeId = absence?.employeeId ?? linkedWorkdays[0]!.employeeId;

    let dateFrom = linkedWorkdays[0]!.workDate;
    let dateTo = linkedWorkdays[0]!.workDate;
    for (const workday of linkedWorkdays) {
      if (workday.workDate < dateFrom) {
        dateFrom = workday.workDate;
      }
      if (workday.workDate > dateTo) {
        dateTo = workday.workDate;
      }
    }

    const approvedAbsences = await absenceRequestRepository.listApprovedByEmployeeAndDateRange(
      companyId,
      employeeId,
      dateFrom,
      dateTo,
    );

    return reconcileWorkdayBatch(companyId, linkedWorkdays, approvedAbsences, attendanceIds);
  },

  async reconcileEmployeeDateRange(
    companyId: string,
    employeeId: string,
    dateFrom: string,
    dateTo: string,
  ): Promise<AbsenceWorkdayReconciliationResult> {
    const [workdays, approvedAbsences] = await Promise.all([
      employeeWorkdayRepository.listWithWorkDatesByEmployeeAndDateRange(
        companyId,
        employeeId,
        dateFrom,
        dateTo,
      ),
      absenceRequestRepository.listApprovedByEmployeeAndDateRange(
        companyId,
        employeeId,
        dateFrom,
        dateTo,
      ),
    ]);

    if (workdays.length === 0) {
      return emptyAbsenceWorkdayReconciliationResult();
    }

    const attendanceIds = await employeeWorkdayRepository.listAttendancePresenceForEmployeeWorkdayIds(
      companyId,
      workdays.map((workday) => workday.id),
    );

    return reconcileWorkdayBatch(companyId, workdays, approvedAbsences, attendanceIds);
  },

  async reconcileEmployeeWorkdays(
    companyId: string,
    employeeWorkdayIds: string[],
  ): Promise<AbsenceWorkdayReconciliationResult> {
    if (employeeWorkdayIds.length === 0) {
      return emptyAbsenceWorkdayReconciliationResult();
    }

    const workdays = await employeeWorkdayRepository.listWithWorkDatesByEmployeeWorkdayIds(
      companyId,
      employeeWorkdayIds,
    );
    if (workdays.length === 0) {
      return emptyAbsenceWorkdayReconciliationResult();
    }

    let dateFrom = workdays[0]!.workDate;
    let dateTo = workdays[0]!.workDate;
    const employeeIds = new Set<string>();
    for (const workday of workdays) {
      employeeIds.add(workday.employeeId);
      if (workday.workDate < dateFrom) {
        dateFrom = workday.workDate;
      }
      if (workday.workDate > dateTo) {
        dateTo = workday.workDate;
      }
    }

    const approvedAbsences = await absenceRequestRepository.listApprovedByEmployeesAndDateRange(
      companyId,
      [...employeeIds],
      dateFrom,
      dateTo,
    );

    const attendanceIds = await employeeWorkdayRepository.listAttendancePresenceForEmployeeWorkdayIds(
      companyId,
      workdays.map((workday) => workday.id),
    );

    return reconcileWorkdayBatch(companyId, workdays, approvedAbsences, attendanceIds);
  },

  async reconcileMaterializationRange(
    companyId: string,
    rangeStart: string,
    rangeEnd: string,
    employeeIds: string[],
  ): Promise<AbsenceWorkdayReconciliationResult> {
    if (employeeIds.length === 0) {
      return emptyAbsenceWorkdayReconciliationResult();
    }

    const counters = emptyAbsenceWorkdayReconciliationResult();
    for (const employeeId of employeeIds) {
      const partial = await this.reconcileEmployeeDateRange(
        companyId,
        employeeId,
        rangeStart,
        rangeEnd,
      );
      mergeAbsenceWorkdayReconciliationResults(counters, partial);
    }

    return counters;
  },
};
