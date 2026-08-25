import type { Operation } from "../types/domain";
import { adminAlertContextRepository } from "../repositories/admin-alert-context.repository";
import { buildMissingCheckinDedupKey } from "../utils/admin-alert/dedup-keys";
import { emitAdminAlertSafely } from "./admin-alert-emit.helpers";

export const adminAlertMissingCheckinService = {
  async emitForCompletedOperation(companyId: string, operation: Operation): Promise<void> {
    if (operation.status !== "COMPLETED" || operation.operationKind !== "ONE_TIME") {
      return;
    }

    const candidates = await adminAlertContextRepository.listMissingCheckinCandidatesForOperation(
      companyId,
      operation.id,
    );

    for (const candidate of candidates) {
      const occurredAt = new Date(
        candidate.scheduledEnd ?? candidate.scheduledStart,
      );
      await emitAdminAlertSafely(
        {
          companyId,
          type: "MISSING_CHECKIN_AFTER_OPERATION",
          employeeId: candidate.employeeId,
          operationId: candidate.operationId,
          deduplicationKey: buildMissingCheckinDedupKey(candidate.employeeWorkdayId),
          occurredAt,
          payload: {
            employeeName: candidate.employeeName,
            serviceName: candidate.serviceName,
            serviceAddress: candidate.serviceAddress,
            serviceLocality: candidate.serviceLocality,
            scheduledStart: candidate.scheduledStart,
            scheduledEnd: candidate.scheduledEnd,
            operationTimezone: candidate.operationTimezone,
          },
        },
        "operation-lifecycle-missing-checkin",
      );
      const { attendanceThresholdAlertService } = await import(
        "./attendance-threshold-alert.service"
      );
      await attendanceThresholdAlertService.markEmployeeDirty(companyId, candidate.employeeId);
    }
  },
};
