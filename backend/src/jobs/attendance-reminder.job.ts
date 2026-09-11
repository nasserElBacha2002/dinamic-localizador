import { env } from "../config/env";
import { attendanceReminderService } from "../services/attendance-reminder.service";
import { runInstrumentedJobTick } from "../utils/system-logs/job-tick";

const JOB_INTERVAL_MS = 60_000;

let intervalHandle: NodeJS.Timeout | null = null;
let isRunning = false;

const runJobSafely = async (): Promise<void> => {
  if (isRunning) {
    console.info("[attendance-reminder] previous run still in progress, skipping tick");
    return;
  }

  isRunning = true;
  try {
    await runInstrumentedJobTick({
      module: "attendance-reminder",
      jobName: "attendance-reminder",
      completedEvent: "attendance-reminder.run.completed",
      failedEvent: "attendance-reminder.run.failed",
      completedMessage: "Attendance reminder tick completed",
      failedMessage: "Attendance reminder job failed",
      run: async () => {
        await attendanceReminderService.runDueRemindersForAllCompanies();
      },
    });
  } finally {
    isRunning = false;
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
