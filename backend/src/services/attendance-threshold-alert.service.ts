import { randomUUID } from "node:crypto";
import {
  ATTENDANCE_ALERT_EVALUATION_BATCH_SIZE,
  ATTENDANCE_ALERT_EVALUATION_LEASE_SECONDS,
} from "../constants/attendance-alert";
import { companySettingsRepository } from "../repositories/company-settings.repository";
import { attendanceAlertMetricsRepository } from "../repositories/attendance-alert-metrics.repository";
import {
  attendanceAlertEvaluationQueueRepository,
  attendanceAlertStateRepository,
} from "../repositories/attendance-alert-state.repository";
import {
  classifyAttendanceThresholdTransition,
  isCooldownElapsed,
  resolveAttendanceAlertBand,
} from "../utils/admin-alert/attendance-threshold";
import { buildAttendanceThresholdDedupKey } from "../utils/admin-alert/dedup-keys";
import { logAdminAlertEvent } from "../utils/admin-alert/observability";
import { adminAlertService } from "./admin-alert.service";

export type AttendanceThresholdEvaluationResult = {
  transition: string;
  alerted: boolean;
  band: string;
  rate: number | null;
  evaluatedWorkdays: number;
};

const buildThresholdPayload = (input: {
  employeeName: string;
  displayRate: number;
  thresholdPercent: number;
  windowDays: number;
  evaluatedWorkdays: number;
}) => ({
  employeeName: input.employeeName,
  attendanceRatePercent: input.displayRate,
  attendanceThresholdPercent: input.thresholdPercent,
  attendanceWindowDays: input.windowDays,
  attendanceEvaluatedWorkdays: input.evaluatedWorkdays,
});

const emitCrossingAlert = async (input: {
  companyId: string;
  employeeId: string;
  employeeName: string;
  crossingSequence: number;
  displayRate: number;
  thresholdPercent: number;
  windowDays: number;
  evaluatedWorkdays: number;
  occurredAt: Date;
}): Promise<boolean> => {
  try {
    const result = await adminAlertService.emit({
      companyId: input.companyId,
      type: "ATTENDANCE_THRESHOLD_CROSSED",
      category: "OPERATIONAL",
      severity: "WARNING",
      employeeId: input.employeeId,
      deduplicationKey: buildAttendanceThresholdDedupKey(
        input.employeeId,
        input.crossingSequence,
      ),
      payload: buildThresholdPayload({
        employeeName: input.employeeName,
        displayRate: input.displayRate,
        thresholdPercent: input.thresholdPercent,
        windowDays: input.windowDays,
        evaluatedWorkdays: input.evaluatedWorkdays,
      }),
      occurredAt: input.occurredAt,
    });
    return result.enqueued > 0 || result.dedupSkipped > 0;
  } catch (error) {
    console.error("[attendance-alert] emit crossing failed", {
      companyId: input.companyId,
      employeeId: input.employeeId,
      error: error instanceof Error ? error.message : String(error),
    });
    logAdminAlertEvent("ADMIN_ALERT_FAILED", {
      companyId: input.companyId,
      employeeId: input.employeeId,
      alertType: "ATTENDANCE_THRESHOLD_CROSSED",
      reason: "THRESHOLD_EMIT_FAILED",
    });
    return false;
  }
};

export const attendanceThresholdAlertService = {
  async markEmployeeDirty(companyId: string, employeeId: string): Promise<void> {
    try {
      await attendanceAlertEvaluationQueueRepository.markDirty(companyId, employeeId);
    } catch (error) {
      console.error("[attendance-alert] markDirty failed", {
        companyId,
        employeeId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  async onThresholdSettingsChanged(companyId: string, windowDays: number): Promise<void> {
    await attendanceAlertEvaluationQueueRepository.enqueueEmployeesWithWorkdaysInWindow(
      companyId,
      windowDays,
    );
  },

  async evaluateEmployee(
    companyId: string,
    employeeId: string,
    now: Date = new Date(),
  ): Promise<AttendanceThresholdEvaluationResult | null> {
    const settings = await companySettingsRepository.findByCompanyId(companyId);
    if (!settings?.adminAlertsEnabled || !settings.attendanceThresholdAlertsEnabled) {
      return null;
    }

    const metrics = await attendanceAlertMetricsRepository.getEmployeeWindowMetrics({
      companyId,
      employeeId,
      windowDays: settings.attendanceAlertWindowDays,
      referenceAt: now,
    });
    if (!metrics) {
      return null;
    }

    const nextBand = resolveAttendanceAlertBand({
      presentWorkdays: metrics.presentWorkdays,
      absentWorkdays: metrics.absentWorkdays,
      minimumWorkdays: settings.attendanceAlertMinimumWorkdays,
      thresholdPercent: settings.attendanceAlertThresholdPercent,
    });

    const prior = await attendanceAlertStateRepository.findByEmployee(companyId, employeeId);
    const configVersionMatch =
      prior != null && prior.configVersion === settings.attendanceAlertConfigVersion;

    const transition = classifyAttendanceThresholdTransition({
      priorBand: prior?.currentBand ?? null,
      nextBand,
      configVersionMatch: prior == null ? true : configVersionMatch,
    });

    const rateForStorage =
      nextBand === "INSUFFICIENT_SAMPLE" ? null : metrics.preciseRate;

    const baseUpsert = {
      companyId,
      employeeId,
      currentBand: nextBand,
      lastRate: rateForStorage,
      lastPresentWorkdays: metrics.presentWorkdays,
      lastAbsentWorkdays: metrics.absentWorkdays,
      lastEvaluatedWorkdays: metrics.evaluatedWorkdays,
      lastCrossedBelowAt: prior?.lastCrossedBelowAt
        ? new Date(prior.lastCrossedBelowAt)
        : null,
      lastAlertedAt: prior?.lastAlertedAt ? new Date(prior.lastAlertedAt) : null,
      crossingSequence: prior?.crossingSequence ?? 0,
      configVersion: settings.attendanceAlertConfigVersion,
      clearPendingAlert: false as boolean,
      pendingAlertCrossingSequence: prior?.pendingAlertCrossingSequence ?? null,
      pendingAlertOccurredAt: prior?.pendingAlertOccurredAt
        ? new Date(prior.pendingAlertOccurredAt)
        : null,
      pendingAlertRate: prior?.pendingAlertRate ?? null,
      pendingAlertEvaluatedWorkdays: prior?.pendingAlertEvaluatedWorkdays ?? null,
    };

    const logEvaluated = (extra: Record<string, unknown>) => {
      logAdminAlertEvent("ATTENDANCE_ALERT_EVALUATED", {
        companyId,
        employeeId,
        alertType: "ATTENDANCE_THRESHOLD_CROSSED",
        reason: transition,
        ...extra,
      });
    };

    // Baseline / rebaseline: persist band, never WhatsApp.
    if (
      transition === "BASELINE" ||
      transition === "REBASELINE_CONFIG" ||
      transition === "REBASELINE_FIRST_SAMPLE"
    ) {
      await attendanceAlertStateRepository.upsertState({
        ...baseUpsert,
        clearPendingAlert: true,
        crossingSequence: prior?.crossingSequence ?? 0,
      });
      logAdminAlertEvent("ATTENDANCE_ALERT_BASELINED", {
        companyId,
        employeeId,
        alertType: "ATTENDANCE_THRESHOLD_CROSSED",
        reason: transition,
      });
      logEvaluated({ rate: rateForStorage, sampleSize: metrics.evaluatedWorkdays });
      return {
        transition,
        alerted: false,
        band: nextBand,
        rate: rateForStorage,
        evaluatedWorkdays: metrics.evaluatedWorkdays,
      };
    }

    if (transition === "CROSSING_BELOW") {
      const cooldownOk = isCooldownElapsed(
        prior?.lastAlertedAt,
        settings.attendanceAlertCooldownDays,
        now,
      );

      if (!cooldownOk) {
        await attendanceAlertStateRepository.upsertState(baseUpsert);
        logAdminAlertEvent("ATTENDANCE_ALERT_COOLDOWN_SKIPPED", {
          companyId,
          employeeId,
          alertType: "ATTENDANCE_THRESHOLD_CROSSED",
        });
        logEvaluated({ rate: metrics.preciseRate, sampleSize: metrics.evaluatedWorkdays });
        return {
          transition: "CROSSING_BELOW_COOLDOWN",
          alerted: false,
          band: nextBand,
          rate: metrics.preciseRate,
          evaluatedWorkdays: metrics.evaluatedWorkdays,
        };
      }

      const crossingSequence = (prior?.crossingSequence ?? 0) + 1;
      const occurredAt = now;

      await attendanceAlertStateRepository.upsertState({
        ...baseUpsert,
        crossingSequence,
        lastCrossedBelowAt: occurredAt,
        lastAlertedAt: occurredAt,
        pendingAlertCrossingSequence: crossingSequence,
        pendingAlertOccurredAt: occurredAt,
        pendingAlertRate: metrics.displayRate,
        pendingAlertEvaluatedWorkdays: metrics.evaluatedWorkdays,
      });

      logAdminAlertEvent("ATTENDANCE_THRESHOLD_CROSSED", {
        companyId,
        employeeId,
        alertType: "ATTENDANCE_THRESHOLD_CROSSED",
        reason: `seq=${crossingSequence}`,
      });

      const emitted = await emitCrossingAlert({
        companyId,
        employeeId,
        employeeName: metrics.employeeName,
        crossingSequence,
        displayRate: metrics.displayRate,
        thresholdPercent: settings.attendanceAlertThresholdPercent,
        windowDays: settings.attendanceAlertWindowDays,
        evaluatedWorkdays: metrics.evaluatedWorkdays,
        occurredAt,
      });

      if (emitted) {
        await attendanceAlertStateRepository.clearPendingAlert(
          companyId,
          employeeId,
          crossingSequence,
        );
      }

      logEvaluated({
        rate: metrics.preciseRate,
        sampleSize: metrics.evaluatedWorkdays,
        crossingSequence,
      });

      return {
        transition,
        alerted: emitted,
        band: nextBand,
        rate: metrics.preciseRate,
        evaluatedWorkdays: metrics.evaluatedWorkdays,
      };
    }

    await attendanceAlertStateRepository.upsertState(baseUpsert);
    logEvaluated({ rate: rateForStorage, sampleSize: metrics.evaluatedWorkdays });
    return {
      transition,
      alerted: false,
      band: nextBand,
      rate: rateForStorage,
      evaluatedWorkdays: metrics.evaluatedWorkdays,
    };
  },

  async processEvaluationBatch(
    batchSize = ATTENDANCE_ALERT_EVALUATION_BATCH_SIZE,
  ): Promise<{ claimed: number; evaluated: number; failed: number }> {
    await attendanceAlertEvaluationQueueRepository.recoverExpiredLeases(batchSize);
    const workerId = `attendance-alert-${randomUUID()}`;
    let claimed = 0;
    let evaluated = 0;
    let failed = 0;

    for (let i = 0; i < batchSize; i += 1) {
      const item = await attendanceAlertEvaluationQueueRepository.claimNextOne(
        workerId,
        ATTENDANCE_ALERT_EVALUATION_LEASE_SECONDS,
      );
      if (!item) {
        break;
      }
      claimed += 1;
      try {
        await this.evaluateEmployee(item.companyId, item.employeeId);
        await attendanceAlertEvaluationQueueRepository.markCompleted(
          item.companyId,
          item.id,
          workerId,
        );
        evaluated += 1;
      } catch (error) {
        failed += 1;
        await attendanceAlertEvaluationQueueRepository.markFailed({
          companyId: item.companyId,
          queueId: item.id,
          leaseOwner: workerId,
          errorCode: "EVALUATION_FAILED",
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { claimed, evaluated, failed };
  },

  async reconcilePendingCrossingAlerts(batchSize = 50): Promise<{
    scanned: number;
    recovered: number;
  }> {
    const pending = await attendanceAlertStateRepository.listPendingAlertStates(batchSize);
    let recovered = 0;

    for (const state of pending) {
      if (state.pendingAlertCrossingSequence == null) {
        continue;
      }
      const settings = await companySettingsRepository.findByCompanyId(state.companyId);
      if (!settings?.adminAlertsEnabled || !settings.attendanceThresholdAlertsEnabled) {
        continue;
      }

      const metrics = await attendanceAlertMetricsRepository.getEmployeeWindowMetrics({
        companyId: state.companyId,
        employeeId: state.employeeId,
        windowDays: settings.attendanceAlertWindowDays,
      });
      if (!metrics) {
        continue;
      }

      const occurredAt = state.pendingAlertOccurredAt
        ? new Date(state.pendingAlertOccurredAt)
        : new Date();
      const displayRate = state.pendingAlertRate ?? metrics.displayRate;
      const evaluatedWorkdays =
        state.pendingAlertEvaluatedWorkdays ?? metrics.evaluatedWorkdays;

      const emitted = await emitCrossingAlert({
        companyId: state.companyId,
        employeeId: state.employeeId,
        employeeName: metrics.employeeName,
        crossingSequence: state.pendingAlertCrossingSequence,
        displayRate,
        thresholdPercent: settings.attendanceAlertThresholdPercent,
        windowDays: settings.attendanceAlertWindowDays,
        evaluatedWorkdays,
        occurredAt,
      });

      if (emitted) {
        await attendanceAlertStateRepository.clearPendingAlert(
          state.companyId,
          state.employeeId,
          state.pendingAlertCrossingSequence,
        );
        recovered += 1;
      }
    }

    return { scanned: pending.length, recovered };
  },
};
