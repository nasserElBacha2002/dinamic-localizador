import { DateTime } from "luxon";
import { resolveEmployeeAbsenceAvailabilityStatus } from "../domain/absence-operational-effects";
import { absenceRequestRepository } from "../repositories/absence-request.repository";
import { employeeRepository } from "../repositories/employee.repository";
import type { EmployeeAbsenceAvailabilityStatus } from "../types/absence-operational-impact";
import { isWorkdayCoveredByAbsence } from "../utils/absence-workday-coverage";
import { absenceOperationalImpactQueryService } from "./absence-operational-impact-query.service";

export type EmployeeAvailabilityQuery = {
  companyId: string;
  employeeId: string;
  onDate: string;
};

export type EmployeeAvailabilityIntervalQuery = {
  companyId: string;
  employeeId: string;
  startAt: Date;
  endAt: Date;
  timezone?: string;
};

/**
 * Single policy for employee availability derived from absences (no employee.is_absent flag).
 */
export const employeeAvailabilityService = {
  async getStatusForDate(
    input: EmployeeAvailabilityQuery,
  ): Promise<EmployeeAbsenceAvailabilityStatus> {
    const interval = await this.getAvailabilityForInterval({
      companyId: input.companyId,
      employeeId: input.employeeId,
      startAt: new Date(`${input.onDate}T00:00:00.000Z`),
      endAt: new Date(`${input.onDate}T23:59:59.999Z`),
    });
    return interval.status;
  },

  async getAvailabilityForInterval(
    input: EmployeeAvailabilityIntervalQuery,
  ): Promise<{
    status: EmployeeAbsenceAvailabilityStatus;
    coveringAbsenceIds: string[];
  }> {
    const employee = await employeeRepository.findById(input.companyId, input.employeeId);
    if (!employee?.active) {
      return { status: "UNAVAILABLE", coveringAbsenceIds: [] };
    }

    const timezone =
      input.timezone ??
      (await absenceOperationalImpactQueryService.getOperationTimezone(input.companyId));
    const localStart = DateTime.fromJSDate(input.startAt, { zone: "utc" }).setZone(timezone);
    const localEnd = DateTime.fromJSDate(input.endAt, { zone: "utc" }).setZone(timezone);
    const dateFrom = localStart.toISODate()!;
    const dateTo = localEnd.toISODate()!;

    const approved = await absenceRequestRepository.listApprovedByEmployeeAndDateRange(
      input.companyId,
      input.employeeId,
      dateFrom,
      dateTo,
    );

    const workdayContext = {
      workDate: dateFrom,
      expectedStartAt: input.startAt.toISOString(),
      expectedEndAt: input.endAt.toISOString(),
      scheduleTimezone: timezone,
    };

    const coveringApproved = approved.filter((absence) =>
      isWorkdayCoveredByAbsence(workdayContext, {
        id: absence.id,
        employeeId: absence.employeeId,
        startDate: absence.startDate,
        endDate: absence.endDate,
        startPeriod: absence.startPeriod,
        endPeriod: absence.endPeriod,
        reviewedAt: absence.reviewedAt,
        createdAt: absence.createdAt,
      }),
    );

    const pending = await absenceRequestRepository.list(input.companyId, {
      page: 1,
      limit: 50,
      employeeIds: [input.employeeId],
      status: "PENDING",
      dateFrom,
      dateTo,
    });
    const needsInfo = await absenceRequestRepository.list(input.companyId, {
      page: 1,
      limit: 50,
      employeeIds: [input.employeeId],
      status: "NEEDS_INFO",
      dateFrom,
      dateTo,
    });
    const provisional = [...pending.items, ...needsInfo.items].filter((r) =>
      isWorkdayCoveredByAbsence(workdayContext, {
        id: r.id,
        employeeId: r.employeeId,
        startDate: r.startDate,
        endDate: r.endDate,
        startPeriod: r.startPeriod,
        endPeriod: r.endPeriod,
        reviewedAt: r.reviewedAt,
        createdAt: r.createdAt,
      }),
    );

    const hasPartial = coveringApproved.some(
      (r) => r.startPeriod !== "FULL_DAY" || r.endPeriod !== "FULL_DAY",
    );

    return {
      status: resolveEmployeeAbsenceAvailabilityStatus({
        employeeActive: true,
        hasApprovedCovering: coveringApproved.length > 0,
        hasPendingOrNeedsInfoCovering: provisional.length > 0,
        hasPartialDayCovering: hasPartial,
      }),
      coveringAbsenceIds: coveringApproved.map((a) => a.id),
    };
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
