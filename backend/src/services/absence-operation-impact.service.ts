import { resolveAbsenceOperationalEffectPlan } from "../domain/absence-operational-effects";
import { resolveEmployeeAbsenceAvailabilityStatus } from "../domain/absence-operational-effects";
import { AppError } from "../errors/app-error";
import { absenceOperationalImpactRepository } from "../repositories/absence-operational-impact.repository";
import { absenceRequestRepository } from "../repositories/absence-request.repository";
import { companySettingsRepository } from "../repositories/company-settings.repository";
import { employeeRepository } from "../repositories/employee.repository";
import { employeeWorkdayRepository } from "../repositories/employee-workday.repository";
import type { AffectedOperationWarning } from "../types/absence";
import {
  buildOperationalConflictIdempotencyKey,
  buildOperationalEffectIdempotencyKey,
  type AbsenceOperationalImpactResult,
} from "../types/absence-operational-impact";
import { absenceDateRangeToUtcBounds, getUtcOffsetHoursFromTimezone } from "../utils/absence-date";
import { isWorkdayCoveredByAbsence } from "../utils/absence-workday-coverage";
import { resolveOperationTimezone } from "../utils/operation-timezone";
import { auditService } from "./audit.service";
import { employeeWorkdayAbsenceReconciliationService } from "./employee-workday-absence-reconciliation.service";

const rangesOverlap = (
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean => aStart.getTime() <= bEnd.getTime() && bStart.getTime() <= aEnd.getTime();

const emitMetric = (name: string, labels: Record<string, string> = {}): void => {
  console.info(JSON.stringify({ metric: name, ...labels, ts: new Date().toISOString() }));
};

export const absenceOperationImpactService = {
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
    input: {
      employeeId: string;
      startDate: string;
      endDate: string;
    },
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

    const byEmployee = new Map<
      string,
      Array<{ id: string; startAt: Date; endAt: Date }>
    >();

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
          const opEnd = operation.scheduledEnd
            ? new Date(operation.scheduledEnd)
            : opStart;
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
    const operations = await this.findAffectedOperations(
      companyId,
      {
        employeeId: request.employeeId,
        startDate: request.startDate,
        endDate: request.endDate,
      },
      timezone,
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
        operationId: null as string | null,
        serviceId: null as string | null,
        covered: true,
        hasAttendancePresence: hasPresence,
        conflictCode: hasPresence
          ? ("ATTENDANCE_RECORDED_DURING_APPROVED_ABSENCE" as const)
          : null,
      };
    });

    const openConflicts = featureEnabled
      ? (await absenceOperationalImpactRepository.listConflictsByRequest(
          companyId,
          absenceRequestId,
        )).filter((c) => c.status === "OPEN")
      : [];

    const attendanceConflicts = workdayImpacts.filter((w) => w.conflictCode).length;
    const staffingWarnings = operations.map((op) => ({
      operationId: op.operationId,
      code: "OPERATION_AFFECTED" as const,
      message: `La operación ${op.serviceName} se superpone con la ausencia`,
    }));

    const hasPartial =
      request.startPeriod !== "FULL_DAY" || request.endPeriod !== "FULL_DAY";
    const availabilityStatus = resolveEmployeeAbsenceAvailabilityStatus({
      employeeActive: Boolean(employee?.active),
      hasApprovedCovering: request.status === "APPROVED",
      hasPendingOrNeedsInfoCovering:
        request.status === "PENDING" || request.status === "NEEDS_INFO",
      hasPartialDayCovering: hasPartial && request.status === "APPROVED",
    });

    const serviceIds = new Set(operations.map((o) => o.serviceId));
    const version = request.operationalImpactVersion ?? 1;

    return {
      absenceRequestId,
      operationalImpactVersion: version,
      featureEnabled,
      availabilityStatus,
      affectedOperations: operations.length,
      affectedServices: serviceIds.size,
      affectedWorkdays: workdayImpacts.length,
      affectedAssignments: operations.length,
      affectedWorkGroups: 0,
      attendanceConflicts,
      staffingWarnings,
      requiresManualAction:
        attendanceConflicts > 0 || operations.length > 0 || openConflicts.length > 0,
      operations: operations.map((op) => ({
        assignmentId: op.operationId,
        operationId: op.operationId,
        serviceId: op.serviceId,
        serviceName: op.serviceName,
        scheduledStart: op.scheduledStart,
        scheduledEnd: op.scheduledEnd,
        operationStatus: op.status,
      })),
      workdays: workdayImpacts,
      openConflicts,
      reconciliationStatus:
        request.status === "APPROVED"
          ? openConflicts.length > 0
            ? "PARTIAL"
            : "APPLIED"
          : "NOT_APPLICABLE",
    };
  },

  /**
   * After APPROVED workday reconciliation: persist assignment/attendance conflicts
   * without removing assignments. No-op when feature flag is off.
   */
  async applyApprovedOperationalSideEffects(
    companyId: string,
    absenceRequestId: string,
  ): Promise<void> {
    if (!(await this.isFeatureEnabled(companyId))) {
      return;
    }

    emitMetric("absence_operational_reconciliation_started", { status: "APPROVED" });
    const impact = await this.computeImpact(companyId, absenceRequestId);
    const request = await absenceRequestRepository.findById(companyId, absenceRequestId);
    if (!request || request.status !== "APPROVED") {
      return;
    }
    const plan = resolveAbsenceOperationalEffectPlan(request.status);
    if (!plan.createAssignmentConflicts) {
      return;
    }

    const version = impact.operationalImpactVersion;

    for (const op of impact.operations) {
      const key = buildOperationalConflictIdempotencyKey({
        requestId: absenceRequestId,
        version,
        conflictType: "ASSIGNMENT_DURING_ABSENCE",
        targetEntityId: op.operationId,
      });
      await absenceOperationalImpactRepository.upsertConflict({
        companyId,
        absenceRequestId,
        absenceVersion: version,
        conflictType: "ASSIGNMENT_DURING_ABSENCE",
        severity: "WARNING",
        employeeId: request.employeeId,
        operationId: op.operationId,
        serviceId: op.serviceId,
        assignmentId: null,
        idempotencyKey: key,
        rangeStartAt: new Date(op.scheduledStart),
        rangeEndAt: op.scheduledEnd ? new Date(op.scheduledEnd) : null,
      });
      await absenceOperationalImpactRepository.upsertEffect({
        companyId,
        absenceRequestId,
        absenceVersion: version,
        effectType: "ASSIGNMENT_CONFLICT",
        targetEntityType: "operation",
        targetEntityId: op.operationId,
        idempotencyKey: buildOperationalEffectIdempotencyKey({
          requestId: absenceRequestId,
          version,
          effectType: "ASSIGNMENT_CONFLICT",
          targetEntityId: op.operationId,
          action: "conflict",
        }),
      });
      emitMetric("absence_operational_conflict_created", {
        effectType: "ASSIGNMENT_CONFLICT",
        status: "OPEN",
      });
    }

    for (const workday of impact.workdays) {
      if (!workday.conflictCode) {
        continue;
      }
      const key = buildOperationalConflictIdempotencyKey({
        requestId: absenceRequestId,
        version,
        conflictType: "ATTENDANCE_RECORDED_DURING_APPROVED_ABSENCE",
        targetEntityId: workday.employeeWorkdayId,
      });
      await absenceOperationalImpactRepository.upsertConflict({
        companyId,
        absenceRequestId,
        absenceVersion: version,
        conflictType: "ATTENDANCE_RECORDED_DURING_APPROVED_ABSENCE",
        severity: "CRITICAL",
        employeeId: request.employeeId,
        operationId: workday.operationId,
        serviceId: workday.serviceId,
        employeeWorkdayId: workday.employeeWorkdayId,
        idempotencyKey: key,
      });
      emitMetric("absence_attendance_conflict_detected", {
        effectType: "ATTENDANCE_CONFLICT",
        status: "OPEN",
      });
    }

    emitMetric("absence_operational_reconciliation_completed", { status: "APPROVED" });
  },

  async revertOperationalSideEffects(
    companyId: string,
    absenceRequestId: string,
    reason: string,
  ): Promise<void> {
    if (!(await this.isFeatureEnabled(companyId))) {
      return;
    }
    await absenceOperationalImpactRepository.revertEffectsForRequest(
      companyId,
      absenceRequestId,
    );
    await absenceOperationalImpactRepository.dismissOpenConflictsForRequest(
      companyId,
      absenceRequestId,
      reason,
    );
    emitMetric("absence_operational_effect_reverted", { status: "REVERTED" });
  },

  async resolveConflict(
    companyId: string,
    absenceRequestId: string,
    conflictId: string,
    input: {
      resolutionCode:
        | "ASSIGN_REPLACEMENT"
        | "KEEP_REDUCED_STAFFING"
        | "CANCEL_ASSIGNMENT"
        | "DISMISS_WITH_REASON";
      resolutionReason: string;
      replacementEmployeeId?: string | null;
      resolvedByUserId: string;
    },
  ) {
    if (!(await this.isFeatureEnabled(companyId))) {
      throw new AppError(
        409,
        "ABSENCE_OPERATIONAL_INTEGRATION_DISABLED",
        "La integración operativa de ausencias no está habilitada",
      );
    }

    const existing = await absenceOperationalImpactRepository.findConflictById(
      companyId,
      absenceRequestId,
      conflictId,
    );
    if (!existing) {
      throw new AppError(404, "ABSENCE_OPERATIONAL_CONFLICT_NOT_FOUND", "Conflicto no encontrado");
    }
    if (existing.status !== "OPEN") {
      throw new AppError(409, "ABSENCE_OPERATIONAL_CONFLICT_NOT_OPEN", "El conflicto ya fue resuelto");
    }

    if (input.resolutionCode === "ASSIGN_REPLACEMENT") {
      if (!input.replacementEmployeeId) {
        throw new AppError(
          400,
          "REPLACEMENT_REQUIRED",
          "Debe indicar un reemplazo para esta resolución",
        );
      }
      const replacement = await employeeRepository.findById(
        companyId,
        input.replacementEmployeeId,
      );
      if (!replacement?.active) {
        throw new AppError(409, "REPLACEMENT_INVALID", "El reemplazo no es válido o está inactivo");
      }
      // Do not auto-assign to the operation in this phase — only record resolution.
    }

    if (input.resolutionCode === "CANCEL_ASSIGNMENT") {
      // Explicit product rule: do not silently delete assignments; require operations:manage
      // workflows outside this phase. Record intent only.
    }

    const status =
      input.resolutionCode === "DISMISS_WITH_REASON" ? "DISMISSED" : "RESOLVED";
    const updated = await absenceOperationalImpactRepository.resolveConflict({
      companyId,
      absenceRequestId,
      conflictId,
      status,
      resolutionCode: input.resolutionCode,
      resolutionReason: input.resolutionReason,
      resolvedByUserId: input.resolvedByUserId,
      replacementEmployeeId: input.replacementEmployeeId ?? null,
    });
    if (!updated) {
      throw new AppError(409, "ABSENCE_OPERATIONAL_CONFLICT_RACE", "El conflicto ya fue resuelto");
    }

    await auditService.log(companyId, {
      userId: input.resolvedByUserId,
      action: "ABSENCE_OPERATIONAL_CONFLICT_RESOLVED",
      entityType: "absence_operational_conflict",
      entityId: conflictId,
      previousData: { status: existing.status },
      newData: {
        status: updated.status,
        resolutionCode: updated.resolutionCode,
        absenceRequestId,
      },
    });
    emitMetric("absence_operational_conflict_resolved", { status: updated.status });
    return updated;
  },

  async reconcileManually(
    companyId: string,
    absenceRequestId: string,
    userId: string,
  ): Promise<AbsenceOperationalImpactResult> {
    if (!(await this.isFeatureEnabled(companyId))) {
      throw new AppError(
        409,
        "ABSENCE_OPERATIONAL_INTEGRATION_DISABLED",
        "La integración operativa de ausencias no está habilitada",
      );
    }
    const request = await absenceRequestRepository.findById(companyId, absenceRequestId);
    if (!request) {
      throw new AppError(404, "ABSENCE_REQUEST_NOT_FOUND", "Solicitud de ausencia no encontrada");
    }

    if (request.status === "APPROVED") {
      await employeeWorkdayAbsenceReconciliationService.reconcileForApprovedAbsence(
        companyId,
        absenceRequestId,
      );
      await this.applyApprovedOperationalSideEffects(companyId, absenceRequestId);
    } else if (request.status === "CANCELLED" || request.status === "REJECTED") {
      await employeeWorkdayAbsenceReconciliationService.reconcileForRevokedAbsence(
        companyId,
        absenceRequestId,
      );
      await this.revertOperationalSideEffects(
        companyId,
        absenceRequestId,
        `manual_reconcile:${request.status}`,
      );
    }

    await auditService.log(companyId, {
      userId,
      action: "ABSENCE_OPERATIONAL_RECONCILE_MANUAL",
      entityType: "absence_request",
      entityId: absenceRequestId,
      newData: { status: request.status },
    });

    return this.computeImpact(companyId, absenceRequestId);
  },
};
