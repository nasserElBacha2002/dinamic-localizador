import { resolveEmployeeAbsenceAvailabilityStatus } from "../domain/absence-operational-effects";
import { absenceRequestRepository } from "../repositories/absence-request.repository";
import { employeeRepository } from "../repositories/employee.repository";
import type { EmployeeAbsenceAvailabilityStatus } from "../types/absence-operational-impact";

export type EmployeeAvailabilityQuery = {
  companyId: string;
  employeeId: string;
  /** Local calendar date YYYY-MM-DD in company timezone. */
  onDate: string;
};

/**
 * Single policy for employee availability derived from absences (no employee.is_absent flag).
 */
export const employeeAvailabilityService = {
  async getStatusForDate(
    input: EmployeeAvailabilityQuery,
  ): Promise<EmployeeAbsenceAvailabilityStatus> {
    const employee = await employeeRepository.findById(input.companyId, input.employeeId);
    if (!employee?.active) {
      return "UNAVAILABLE";
    }

    const approved = await absenceRequestRepository.listApprovedByEmployeeAndDateRange(
      input.companyId,
      input.employeeId,
      input.onDate,
      input.onDate,
    );

    const pending = await absenceRequestRepository.list(input.companyId, {
      page: 1,
      limit: 50,
      employeeIds: [input.employeeId],
      status: "PENDING",
      dateFrom: input.onDate,
      dateTo: input.onDate,
    });
    const needsInfo = await absenceRequestRepository.list(input.companyId, {
      page: 1,
      limit: 50,
      employeeIds: [input.employeeId],
      status: "NEEDS_INFO",
      dateFrom: input.onDate,
      dateTo: input.onDate,
    });

    const provisional = [...pending.items, ...needsInfo.items].filter(
      (r) => r.startDate <= input.onDate && r.endDate >= input.onDate,
    );

    const hasPartial = approved.some(
      (r) => r.startPeriod !== "FULL_DAY" || r.endPeriod !== "FULL_DAY",
    );

    return resolveEmployeeAbsenceAvailabilityStatus({
      employeeActive: true,
      hasApprovedCovering: approved.length > 0,
      hasPendingOrNeedsInfoCovering: provisional.length > 0,
      hasPartialDayCovering: hasPartial,
    });
  },

  async listUpcomingApprovedAbsences(
    companyId: string,
    employeeId: string,
    fromDate: string,
    limit = 10,
  ) {
    const approved = await absenceRequestRepository.listApprovedByEmployeeAndDateRange(
      companyId,
      employeeId,
      fromDate,
      "9999-12-31",
    );
    return approved.slice(0, limit);
  },
};
