import {
  resolveAbsenceOperationalEffectPlan,
  resolveEmployeeAbsenceAvailabilityStatus,
} from "../domain/absence-operational-effects";
import { AppError } from "../errors/app-error";
import { absenceOperationalImpactRepository } from "../repositories/absence-operational-impact.repository";
import { absenceRequestRepository } from "../repositories/absence-request.repository";
import { absenceWorkdaySyncJobRepository } from "../repositories/absence-workday-sync-job.repository";
import { companySettingsRepository } from "../repositories/company-settings.repository";
import { employeeRepository } from "../repositories/employee.repository";
import { employeeWorkdayRepository } from "../repositories/employee-workday.repository";
import type { AffectedOperationWarning } from "../types/absence";
import type { AbsenceOperationalImpactResult } from "../types/absence-operational-impact";
import { absenceDateRangeToUtcBounds, getUtcOffsetHoursFromTimezone } from "../utils/absence-date";
import { isWorkdayCoveredByAbsence } from "../utils/absence-workday-coverage";
import { resolveOperationTimezone } from "../utils/operation-timezone";

const rangesOverlap = (
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean => aStart.getTime() <= bEnd.getTime() && bStart.getTime() <= aEnd.getTime();

const mapJobStatusToReconciliation = (
  jobStatus: string | null | undefined,
  requestStatus: string,
): AbsenceOperationalImpactResult["reconciliationStatus"] => {
  if (requestStatus !== "APPROVED" && requestStatus !== "CANCELLED" && requestStatus !== "REJECTED") {
    return "NOT_APPLICABLE";
  }
  switch (jobStatus) {
    case "PENDING":
      return "PENDING";
    case "PROCESSING":
      return "PROCESSING";
    case "COMPLETED":
      return requestStatus === "CANCELLED" || requestStatus === "REJECTED" ? "REVERTED" : "APPLIED";
    case "FAILED":
      return "FAILED";
    case "SUPERSEDED":
      return "SUPERSEDED";
    default:
      return requestStatus === "APPROVED" || requestStatus === "CANCELLED" || requestStatus === "REJECTED"
        ? "PENDING"
        : "NOT_APPLICABLE";
  }
};

export const absenceOperationalImpactQueryService = {
  async isFeatureEnabled(companyId: string): Promise<boolean> {
    const settings = await companySettingsRepository.findByCompanyId(companyId);
    return Boolean(settings?.absenceOperationalIntegrationEnabled);
  },

  async getOperationTimezone(companyId: string): Promise<string> {
    const settings = await companySettingsRepository.findByCompanyId(companyId);
    return resolveOperationTimezone(settings?.operationTimezone);
  },

  async findAffectedOperations(
    companyId: string,
    input: { employeeId: string; startDate: string; endDate: string },
    timezone?: string,
  ): Promise<AffectedOperationWarning[]> {
    const resolvedTimezone = timezone ?? (await this.getOperationTimezone(companyId));
    const utcOffsetHours = getUtcOffsetHoursFromTimezone(resolvedTimezone);
    const { startAt, endAt } = absenceDateRangeToUtcBounds(
      input.startDate,
      input.endDate,
      utcOffsetHours,
    );
    const operations = await absenceRequestRepository.findAffectedOperations(
      companyId,
      input.employeeId,
      startAt,
      endAt,
    );
    return operations.map((operation) => ({
      operationId: operation.operationId,
      serviceId: operation.serviceId,
      serviceName: operation.serviceName,
      scheduledStart: operation.scheduledStart,
      scheduledEnd: operation.scheduledEnd,
      status: operation.status,
    }));
  },

  async countAffectedOperationsForList(
    companyId: string,
    items: Array<{ id: string; employeeId: string; startDate: string; endDate: string }>,
  ): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (items.length === 0) {
      return counts;
    }
    const timezone = await this.getOperationTimezone(companyId);
    const utcOffsetHours = getUtcOffsetHoursFromTimezone(timezone);
    const byEmployee = new Map<string, Array<{ id: string; startAt: Date; endAt: Date }>>();

    for (const item of items) {
      const { startAt, endAt } = absenceDateRangeToUtcBounds(
        item.startDate,
        item.endDate,
        utcOffsetHours,
      );
      const list = byEmployee.get(item.employeeId) ?? [];
      list.push({ id: item.id, startAt, endAt });
      byEmployee.set(item.employeeId, list);
      counts.set(item.id, 0);
    }

    for (const [employeeId, ranges] of byEmployee) {
      const windowStart = new Date(Math.min(...ranges.map((r) => r.startAt.getTime())));
      const windowEnd = new Date(Math.max(...ranges.map((r) => r.endAt.getTime())));
      const operations = await absenceRequestRepository.findAffectedOperations(
        companyId,
        employeeId,
        windowStart,
        windowEnd,
      );
      for (const range of ranges) {
        const matching = operations.filter((operation) => {
          const opStart = new Date(operation.scheduledStart);
          const opEnd = operation.scheduledEnd ? new Date(operation.scheduledEnd) : opStart;
          return rangesOverlap(range.startAt, range.endAt, opStart, opEnd);
        });
        counts.set(range.id, matching.length);
      }
    }
    return counts;
  },

  async computeImpact(
    companyId: string,
    absenceRequestId: string,
  ): Promise<AbsenceOperationalImpactResult> {
    const request = await absenceRequestRepository.findById(companyId, absenceRequestId);
    if (!request) {
      throw new AppError(404, "ABSENCE_REQUEST_NOT_FOUND", "Solicitud de ausencia no encontrada");
    }

    const featureEnabled = await this.isFeatureEnabled(companyId);
    const timezone = await this.getOperationTimezone(companyId);
    const employee = await employeeRepository.findById(companyId, request.employeeId);
    const utcOffsetHours = getUtcOffsetHoursFromTimezone(timezone);
    const { startAt, endAt } = absenceDateRangeToUtcBounds(
      request.startDate,
      request.endDate,
      utcOffsetHours,
    );

    const assignments = await absenceRequestRepository.findAffectedAssignments(
      companyId,
      request.employeeId,
      startAt,
      endAt,
    );

    const workdays = await employeeWorkdayRepository.listWithWorkDatesByEmployeeAndDateRange(
      companyId,
      request.employeeId,
      request.startDate,
      request.endDate,
    );
    const attendanceIds =
      await employeeWorkdayRepository.listAttendancePresenceForEmployeeWorkdayIds(
        companyId,
        workdays.map((w) => w.id),
      );

    const coveredWorkdays = workdays.filter((workday) =>
      isWorkdayCoveredByAbsence(workday, {
        id: request.id,
        employeeId: request.employeeId,
        startDate: request.startDate,
        endDate: request.endDate,
        startPeriod: request.startPeriod,
        endPeriod: request.endPeriod,
        reviewedAt: request.reviewedAt,
        createdAt: request.createdAt,
      }),
    );

    const workdayImpacts = coveredWorkdays.map((workday) => {
      const hasPresence = attendanceIds.has(workday.id);
      return {
        employeeWorkdayId: workday.id,
        workDate: workday.workDate,
        operationId: workday.operationId,
        serviceId: workday.serviceId,
        covered: true,
        hasAttendancePresence: hasPresence,
        conflictCode: hasPresence
          ? ("ATTENDANCE_RECORDED_DURING_APPROVED_ABSENCE" as const)
          : null,
      };
    });

    const openConflicts = featureEnabled
      ? (
          await absenceOperationalImpactRepository.listConflictsByRequest(
            companyId,
            absenceRequestId,
          )
        ).filter((c) => c.status === "OPEN")
      : [];

    const latestJob = await absenceWorkdaySyncJobRepository.findLatestByRequest(
      companyId,
      absenceRequestId,
    );
    const plan = resolveAbsenceOperationalEffectPlan(request.status);
    const attendanceConflicts = workdayImpacts.filter((w) => w.conflictCode).length;
    const serviceIds = new Set(assignments.map((a) => a.serviceId));
    const operationIds = new Set(assignments.map((a) => a.operationId));
    const hasPartial =
      request.startPeriod !== "FULL_DAY" || request.endPeriod !== "FULL_DAY";

    const availabilityStatus = resolveEmployeeAbsenceAvailabilityStatus({
      employeeActive: Boolean(employee?.active),
      hasApprovedCovering: request.status === "APPROVED",
      hasPendingOrNeedsInfoCovering:
        request.status === "PENDING" || request.status === "NEEDS_INFO",
      hasPartialDayCovering: hasPartial && request.status === "APPROVED",
    });

    let reconciliationStatus = mapJobStatusToReconciliation(latestJob?.status, request.status);
    if (
      reconciliationStatus === "APPLIED" &&
      openConflicts.some((c) => c.severity === "CRITICAL")
    ) {
      reconciliationStatus = "PARTIALLY_APPLIED";
    }

    return {
      absenceRequestId,
      operationalImpactVersion: request.operationalImpactVersion ?? 1,
      featureEnabled,
      availabilityStatus,
      affectedOperations: operationIds.size,
      affectedServices: serviceIds.size,
      affectedWorkdays: workdayImpacts.length,
      affectedAssignments: assignments.length,
      affectedWorkGroups: 0,
      attendanceConflicts,
      staffingWarnings: [...operationIds].map((operationId) => {
        const sample = assignments.find((a) => a.operationId === operationId)!;
        return {
          operationId,
          code: "OPERATION_AFFECTED" as const,
          message: `La operación ${sample.serviceName} se superpone con la ausencia`,
        };
      }),
      requiresManualAction:
        attendanceConflicts > 0 ||
        (plan.createAssignmentConflicts && assignments.length > 0) ||
        openConflicts.length > 0,
      operations: assignments.map((a) => ({
        assignmentId: a.assignmentId,
        operationId: a.operationId,
        serviceId: a.serviceId,
        serviceName: a.serviceName,
        employeeId: a.employeeId,
        scheduledStart: a.scheduledStart,
        scheduledEnd: a.scheduledEnd,
        operationStatus: a.operationStatus,
        validFrom: a.validFrom,
        validTo: a.validTo,
        categoryId: a.categoryId,
        categoryName: a.categoryName,
      })),
      workdays: workdayImpacts,
      openConflicts,
      reconciliationStatus,
      reconciliationJobId: latestJob?.id ?? null,
      reconciliationLastError: latestJob?.lastError ?? null,
      reconciliationAttempts: latestJob?.attemptCount ?? null,
    };
  },
};
