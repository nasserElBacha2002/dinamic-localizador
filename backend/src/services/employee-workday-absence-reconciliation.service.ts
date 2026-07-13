import { absenceRequestRepository } from "../repositories/absence-request.repository";
import {
  employeeWorkdayRepository,
  type EmployeeWorkdayWithSchedule,
} from "../repositories/employee-workday.repository";
import type { ApprovedAbsenceForWorkday } from "../types/absence";
import {
  emptyAbsenceWorkdayReconciliationResult,
  type AbsenceWorkdayReconciliationResult,
} from "../types/absence-workday-reconciliation";
import {
  applyPersistedAbsenceDeltas,
  resolveWorkdayAbsenceDeltas,
} from "../utils/resolve-workday-absence-deltas";
import { getAbsenceDateRangeForWorkday } from "../utils/absence-workday-coverage";

const getDateRangeBounds = (workdays: EmployeeWorkdayWithSchedule[]): {
  dateFrom: string;
  dateTo: string;
} => {
  let dateFrom = workdays[0]!.workDate;
  let dateTo = workdays[0]!.workDate;
  for (const workday of workdays) {
    const range = getAbsenceDateRangeForWorkday(workday);
    if (range.dateFrom < dateFrom) {
      dateFrom = range.dateFrom;
    }
    if (range.dateTo > dateTo) {
      dateTo = range.dateTo;
    }
  }
  return { dateFrom, dateTo };
};

const reconcileLoadedWorkdays = async (
  companyId: string,
  workdays: EmployeeWorkdayWithSchedule[],
  approvedAbsences: ApprovedAbsenceForWorkday[],
  attendanceEmployeeWorkdayIds: Set<string>,
): Promise<AbsenceWorkdayReconciliationResult> => {
  if (workdays.length === 0) {
    return emptyAbsenceWorkdayReconciliationResult();
  }

  const resolution = resolveWorkdayAbsenceDeltas({
    workdays,
    absences: approvedAbsences,
    attendanceEmployeeWorkdayIds,
  });

  const [justifyResult, relinked, restored] = await Promise.all([
    employeeWorkdayRepository.batchJustifyExpectations(companyId, resolution.toJustify),
    employeeWorkdayRepository.batchRelinkJustifiedExpectations(companyId, resolution.toRelink),
    employeeWorkdayRepository.batchRestoreJustifiedExpectations(companyId, resolution.toRestore),
  ]);

  return applyPersistedAbsenceDeltas(
    {
      justified: justifyResult.updated,
      relinked,
      restored,
      justifyRaceConflicts: justifyResult.raceConflicts,
    },
    resolution,
  );
};

const loadReconciliationContext = async (
  companyId: string,
  workdays: EmployeeWorkdayWithSchedule[],
): Promise<{
  approvedAbsences: ApprovedAbsenceForWorkday[];
  attendanceEmployeeWorkdayIds: Set<string>;
}> => {
  const employeeIds = [...new Set(workdays.map((workday) => workday.employeeId))];
  const { dateFrom, dateTo } = getDateRangeBounds(workdays);

  const [approvedAbsences, attendanceEmployeeWorkdayIds] = await Promise.all([
    absenceRequestRepository.listApprovedByEmployeesAndDateRange(
      companyId,
      employeeIds,
      dateFrom,
      dateTo,
    ),
    employeeWorkdayRepository.listAttendancePresenceForEmployeeWorkdayIds(
      companyId,
      workdays.map((workday) => workday.id),
    ),
  ]);

  return { approvedAbsences, attendanceEmployeeWorkdayIds };
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

    const { approvedAbsences, attendanceEmployeeWorkdayIds } = await loadReconciliationContext(
      companyId,
      linkedWorkdays,
    );

    return reconcileLoadedWorkdays(
      companyId,
      linkedWorkdays,
      approvedAbsences,
      attendanceEmployeeWorkdayIds,
    );
  },

  async reconcileEmployeeDateRange(
    companyId: string,
    employeeId: string,
    dateFrom: string,
    dateTo: string,
  ): Promise<AbsenceWorkdayReconciliationResult> {
    const workdays = await employeeWorkdayRepository.listWithWorkDatesByEmployeeAndDateRange(
      companyId,
      employeeId,
      dateFrom,
      dateTo,
    );

    if (workdays.length === 0) {
      return emptyAbsenceWorkdayReconciliationResult();
    }

    const { approvedAbsences, attendanceEmployeeWorkdayIds } = await loadReconciliationContext(
      companyId,
      workdays,
    );

    return reconcileLoadedWorkdays(
      companyId,
      workdays,
      approvedAbsences,
      attendanceEmployeeWorkdayIds,
    );
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

    const { approvedAbsences, attendanceEmployeeWorkdayIds } = await loadReconciliationContext(
      companyId,
      workdays,
    );

    return reconcileLoadedWorkdays(
      companyId,
      workdays,
      approvedAbsences,
      attendanceEmployeeWorkdayIds,
    );
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

    const workdays = await employeeWorkdayRepository.listWithWorkDatesByEmployeesAndDateRange(
      companyId,
      employeeIds,
      rangeStart,
      rangeEnd,
    );

    if (workdays.length === 0) {
      return emptyAbsenceWorkdayReconciliationResult();
    }

    const { approvedAbsences, attendanceEmployeeWorkdayIds } = await loadReconciliationContext(
      companyId,
      workdays,
    );

    return reconcileLoadedWorkdays(
      companyId,
      workdays,
      approvedAbsences,
      attendanceEmployeeWorkdayIds,
    );
  },
};
