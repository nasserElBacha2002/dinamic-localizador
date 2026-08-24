import type { Operation } from "../types/domain";
import { adminAlertContextRepository } from "../repositories/admin-alert-context.repository";
import { buildMissingCheckinDedupKey } from "../utils/admin-alert/dedup-keys";
import { adminAlertService } from "./admin-alert.service";

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
      await adminAlertService.emit({
        companyId,
        type: "MISSING_CHECKIN_AFTER_OPERATION",
        employeeId: candidate.employeeId,
        operationId: candidate.operationId,
        deduplicationKey: buildMissingCheckinDedupKey(candidate.employeeWorkdayId),
        payload: {
          employeeName: candidate.employeeName,
          serviceName: candidate.serviceName,
          serviceAddress: candidate.serviceAddress,
          serviceLocality: candidate.serviceLocality,
          scheduledStart: candidate.scheduledStart,
          scheduledEnd: candidate.scheduledEnd,
          operationTimezone: candidate.operationTimezone,
        },
      });
    }
  },
};
