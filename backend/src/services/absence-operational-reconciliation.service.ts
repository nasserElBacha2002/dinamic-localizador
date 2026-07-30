import {
  buildOperationalConflictIdempotencyKey,
  buildOperationalEffectIdempotencyKey,
} from "../types/absence-operational-impact";
import { resolveAbsenceOperationalEffectPlan } from "../domain/absence-operational-effects";
import { AppError } from "../errors/app-error";
import { absenceOperationalImpactRepository } from "../repositories/absence-operational-impact.repository";
import { absenceRequestRepository } from "../repositories/absence-request.repository";
import {
  absenceWorkdaySyncJobRepository,
  type AbsenceWorkdaySyncJob,
  type AbsenceWorkdaySyncOperation,
  type JobLeaseToken,
} from "../repositories/absence-workday-sync-job.repository";
import { employeeWorkdayAbsenceReconciliationService } from "./employee-workday-absence-reconciliation.service";
import { absenceOperationalImpactQueryService } from "./absence-operational-impact-query.service";
import type sql from "mssql";

const emitMetric = (name: string, labels: Record<string, string> = {}): void => {
  console.info(JSON.stringify({ metric: name, ...labels, ts: new Date().toISOString() }));
};

const isApproveOperation = (operation: AbsenceWorkdaySyncOperation | string): boolean =>
  operation === "APPROVE" ||
  operation === "AUTO_APPROVE" ||
  operation === "RESUBMIT_AUTO_APPROVE" ||
  operation === "MANUAL_RECONCILE" ||
  operation === "approve";

const isRevokeOperation = (operation: AbsenceWorkdaySyncOperation | string): boolean =>
  operation === "REJECT" ||
  operation === "CANCEL" ||
  operation === "reject" ||
  operation === "cancel";

const supersedeClaimed = async (
  token: JobLeaseToken | undefined,
  job: AbsenceWorkdaySyncJob,
  reason: string,
): Promise<"SUPERSEDED" | "LEASE_LOST"> => {
  try {
    if (token) {
      await absenceWorkdaySyncJobRepository.markSupersededWithLease(token, reason);
    } else {
      await absenceWorkdaySyncJobRepository.markSuperseded(job.companyId, job.id, reason);
    }
    return "SUPERSEDED";
  } catch (error) {
    if (error instanceof AppError && error.code === "JOB_LEASE_LOST") {
      return "LEASE_LOST";
    }
    throw error;
  }
};

export const absenceOperationalReconciliationService = {
  async enqueueInTransaction(
    input: {
      companyId: string;
      absenceRequestId: string;
      absenceStatus: string;
      operation: AbsenceWorkdaySyncOperation;
      expectedOperationalImpactVersion: number;
      enqueueCommandId?: string | null;
    },
    transaction: sql.Transaction,
  ) {
    return absenceWorkdaySyncJobRepository.enqueue(input, transaction);
  },

  async applyApprovedOperationalSideEffects(
    companyId: string,
    absenceRequestId: string,
  ): Promise<void> {
    if (!(await absenceOperationalImpactQueryService.isFeatureEnabled(companyId))) {
      return;
    }

    emitMetric("absence_operational_reconciliation_started", { status: "APPROVED" });
    const impact = await absenceOperationalImpactQueryService.computeImpact(
      companyId,
      absenceRequestId,
    );
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
        targetEntityId: op.assignmentId,
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
        assignmentId: op.assignmentId,
        idempotencyKey: key,
        rangeStartAt: new Date(op.scheduledStart),
        rangeEndAt: op.scheduledEnd ? new Date(op.scheduledEnd) : null,
      });
      await absenceOperationalImpactRepository.upsertEffect({
        companyId,
        absenceRequestId,
        absenceVersion: version,
        effectType: "ASSIGNMENT_CONFLICT",
        targetEntityType: "operation_assignment",
        targetEntityId: op.assignmentId,
        idempotencyKey: buildOperationalEffectIdempotencyKey({
          requestId: absenceRequestId,
          version,
          effectType: "ASSIGNMENT_CONFLICT",
          targetEntityId: op.assignmentId,
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
      await absenceOperationalImpactRepository.upsertEffect({
        companyId,
        absenceRequestId,
        absenceVersion: version,
        effectType: "ATTENDANCE_CONFLICT",
        targetEntityType: "employee_workday",
        targetEntityId: workday.employeeWorkdayId,
        idempotencyKey: buildOperationalEffectIdempotencyKey({
          requestId: absenceRequestId,
          version,
          effectType: "ATTENDANCE_CONFLICT",
          targetEntityId: workday.employeeWorkdayId,
          action: "conflict",
        }),
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
    if (!(await absenceOperationalImpactQueryService.isFeatureEnabled(companyId))) {
      return;
    }
    await absenceOperationalImpactRepository.dismissOpenConflictsForRequest(
      companyId,
      absenceRequestId,
      reason,
    );
    await absenceOperationalImpactRepository.revertEffectsForRequest(
      companyId,
      absenceRequestId,
    );
    emitMetric("absence_operational_effect_reverted", { status: "REVERTED" });
  },

  async executeClaimedJob(
    job: AbsenceWorkdaySyncJob,
    token?: JobLeaseToken,
  ): Promise<"APPLIED" | "SUPERSEDED" | "LEASE_LOST"> {
    if (token) {
      try {
        await absenceWorkdaySyncJobRepository.renewLease(token, 180);
      } catch (error) {
        if (error instanceof AppError && error.code === "JOB_LEASE_LOST") {
          return "LEASE_LOST";
        }
        throw error;
      }
    }

    const request = await absenceRequestRepository.findById(
      job.companyId,
      job.absenceRequestId,
    );
    if (!request) {
      return supersedeClaimed(token, job, "ABSENCE_REQUEST_NOT_FOUND");
    }

    const currentVersion = request.operationalImpactVersion ?? 1;
    if (
      currentVersion !== job.expectedOperationalImpactVersion ||
      request.status !== job.absenceStatus
    ) {
      return supersedeClaimed(
        token,
        job,
        `version/status mismatch current=${request.status}@${currentVersion} expected=${job.absenceStatus}@${job.expectedOperationalImpactVersion}`,
      );
    }

    if (isApproveOperation(job.operation) && request.status === "APPROVED") {
      await employeeWorkdayAbsenceReconciliationService.reconcileForApprovedAbsence(
        job.companyId,
        job.absenceRequestId,
      );
      await this.applyApprovedOperationalSideEffects(job.companyId, job.absenceRequestId);
      return "APPLIED";
    }

    if (
      isRevokeOperation(job.operation) &&
      (request.status === "CANCELLED" || request.status === "REJECTED")
    ) {
      await employeeWorkdayAbsenceReconciliationService.reconcileForRevokedAbsence(
        job.companyId,
        job.absenceRequestId,
      );
      await this.revertOperationalSideEffects(
        job.companyId,
        job.absenceRequestId,
        `job:${job.operation}`,
      );
      return "APPLIED";
    }

    if (job.operation === "MANUAL_RECONCILE") {
      if (request.status === "APPROVED") {
        await employeeWorkdayAbsenceReconciliationService.reconcileForApprovedAbsence(
          job.companyId,
          job.absenceRequestId,
        );
        await this.applyApprovedOperationalSideEffects(job.companyId, job.absenceRequestId);
        return "APPLIED";
      }
      if (request.status === "CANCELLED" || request.status === "REJECTED") {
        await employeeWorkdayAbsenceReconciliationService.reconcileForRevokedAbsence(
          job.companyId,
          job.absenceRequestId,
        );
        await this.revertOperationalSideEffects(
          job.companyId,
          job.absenceRequestId,
          `job:MANUAL_RECONCILE:${request.status}`,
        );
        return "APPLIED";
      }
    }

    return supersedeClaimed(
      token,
      job,
      `operation ${job.operation} incompatible with status ${request.status}`,
    );
  },

  async enqueueManualReconcile(
    companyId: string,
    absenceRequestId: string,
    _userId: string,
    commandId?: string | null,
  ): Promise<{
    jobId: string;
    status: string;
    absenceVersion: number;
    operationalImpactVersion: number;
    retryable: boolean;
  }> {
    if (!(await absenceOperationalImpactQueryService.isFeatureEnabled(companyId))) {
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
    if (
      request.status !== "APPROVED" &&
      request.status !== "CANCELLED" &&
      request.status !== "REJECTED"
    ) {
      throw new AppError(
        409,
        "ABSENCE_NOT_RECONCILABLE",
        "Solo se pueden reconciliar solicitudes aprobadas, rechazadas o canceladas",
      );
    }

    const version = request.operationalImpactVersion ?? 1;
    const job = await absenceWorkdaySyncJobRepository.enqueue({
      companyId,
      absenceRequestId,
      absenceStatus: request.status,
      operation: "MANUAL_RECONCILE",
      expectedOperationalImpactVersion: version,
      enqueueCommandId: commandId?.trim() || null,
    });

    return {
      jobId: job.id,
      status: job.status,
      absenceVersion: version,
      operationalImpactVersion: version,
      retryable: true,
    };
  },
};
