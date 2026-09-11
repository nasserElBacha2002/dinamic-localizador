import { adminAlertContextRepository } from "../repositories/admin-alert-context.repository";
import { logAdminAlertEvent } from "../utils/admin-alert/observability";
import { attendanceThresholdAlertService } from "./attendance-threshold-alert.service";

/**
 * When a ONE_TIME operation becomes COMPLETED without check-in, mark affected
 * employees dirty for attendance-threshold evaluation.
 *
 * Intentionally does NOT enqueue MISSING_CHECKIN_AFTER_OPERATION WhatsApp
 * (replaced by MISSING_CHECKIN_AFTER_START). Failures are logged and rethrown
 * so the lifecycle caller can count them.
 */
export const markMissingCheckinEmployeesDirtyForThreshold = async (
  companyId: string,
  operationId: string,
): Promise<{ candidates: number }> => {
  const candidates = await adminAlertContextRepository.listMissingCheckinCandidatesForOperation(
    companyId,
    operationId,
  );

  for (const candidate of candidates) {
    await attendanceThresholdAlertService.markEmployeeDirty(companyId, candidate.employeeId);
  }

  logAdminAlertEvent("ATTENDANCE_ALERT_EVALUATED", {
    companyId,
    operationId,
    reason: "COMPLETED_OPERATION_MISSING_CHECKIN_DIRTY",
    sampleSize: candidates.length,
  });

  return { candidates: candidates.length };
};
