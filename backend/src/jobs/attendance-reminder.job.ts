import { env } from "../config/env";
import { ATTENDANCE_REMINDER_JOB_LOCK_RESOURCE } from "../constants/job-locks";
import { attendanceReminderService } from "../services/attendance-reminder.service";
import { runInstrumentedJobTick } from "../utils/system-logs/job-tick";
import { withDedicatedSessionAppLock } from "../utils/whatsapp-retention-lock";

const JOB_INTERVAL_MS = 60_000;

let intervalHandle: NodeJS.Timeout | null = null;

/**
 * Cross-replica tick fencing via session app lock.
 * Per-notification claim/CAS remains the side-effect idempotency layer.
 */
const runJobSafely = async (): Promise<void> => {
  try {
    await runInstrumentedJobTick({
      module: "attendance-reminder",
      jobName: "attendance-reminder",
      completedEvent: "attendance-reminder.run.completed",
      failedEvent: "attendance-reminder.run.failed",
      completedMessage: "Attendance reminder tick completed",
      failedMessage: "Attendance reminder job failed",
      run: async () => {
        const lockResult = await withDedicatedSessionAppLock(
          ATTENDANCE_REMINDER_JOB_LOCK_RESOURCE,
          async () => {
            await attendanceReminderService.runDueRemindersForAllCompanies();
            return { ran: true };
          },
          { lockTimeoutMs: 0 },
        );

        if (lockResult.outcome === "skipped") {
          return {
            __skipCompleted: true,
            lockSkipped: true,
          };
        }

        return { lockSkipped: false };
      },
    });
  } catch (error) {
    console.error("[attendance-reminder] unexpected job error", {
      error: error instanceof Error ? error.message : "UNKNOWN",
    });
  }
};

export const startAttendanceReminderJob = (): void => {
  if (!env.ATTENDANCE_REMINDER_JOB_ENABLED) {
    console.info("[attendance-reminder] job not started because ATTENDANCE_REMINDER_JOB_ENABLED=false");
    return;
  }

  if (!attendanceReminderService.isEnabled()) {
    console.info("[attendance-reminder] job not started because Twilio reminder configuration is incomplete");
    return;
  }

  if (intervalHandle) {
    return;
  }

  console.info("[attendance-reminder] starting scheduler (every 60s)");
  void runJobSafely();
  intervalHandle = setInterval(() => {
    void runJobSafely();
  }, JOB_INTERVAL_MS);
};

export const stopAttendanceReminderJob = (): void => {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
};

export const runAttendanceReminderJobOnce = async (): Promise<void> => {
  await runJobSafely();
};
