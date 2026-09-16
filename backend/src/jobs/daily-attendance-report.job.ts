import { env } from "../config/env";
import { runInstrumentedJobTick } from "../utils/system-logs/job-tick";
import { dailyAttendanceReportService } from "../services/daily-attendance-report.service";
import { assertDailyReportAudienceSchemaReady } from "../utils/daily-attendance-report-schema-guard";

let intervalHandle: NodeJS.Timeout | null = null;
let isRunning = false;
let schemaReady: boolean | null = null;

const ensureSchemaReady = async (): Promise<boolean> => {
  if (schemaReady === true) {
    return true;
  }
  const status = await assertDailyReportAudienceSchemaReady();
  if (!status.ok) {
    console.error("[daily-attendance-report] schema incompatible; worker tick skipped", {
      reason: status.reason,
      fkName: status.fkName,
      referencedTable: status.referencedTable,
    });
    schemaReady = false;
    return false;
  }
  schemaReady = true;
  return true;
};

const runJobSafely = async (): Promise<void> => {
  if (isRunning) {
    console.info("[daily-attendance-report] previous run still in progress, skipping tick");
    return;
  }
  if (!env.DAILY_ATTENDANCE_REPORT_WORKER_ENABLED) {
    return;
  }
  isRunning = true;
  try {
    if (!(await ensureSchemaReady())) {
      return;
    }
    await runInstrumentedJobTick({
      module: "daily-attendance-report",
      jobName: "daily-attendance-report",
      completedEvent: "daily-attendance-report.run.completed",
      failedEvent: "daily-attendance-report.run.failed",
      completedMessage: "Daily attendance report worker tick completed",
      failedMessage: "Daily attendance report worker tick failed",
      run: async () => {
        const result = await dailyAttendanceReportService.processNextBatch();
        return {
          recovered: result.recovered,
          processed: result.processed,
        };
      },
    });
  } finally {
    isRunning = false;
  }
};

export const startDailyAttendanceReportJob = (): void => {
  if (intervalHandle) {
    return;
  }
  if (!env.DAILY_ATTENDANCE_REPORT_WORKER_ENABLED) {
    console.info("[daily-attendance-report] disabled by env");
    return;
  }
  console.info(
    `[daily-attendance-report] starting scheduler (every ${env.DAILY_ATTENDANCE_REPORT_WORKER_INTERVAL_MS}ms)`,
  );
  void runJobSafely();
  intervalHandle = setInterval(() => {
    void runJobSafely();
  }, env.DAILY_ATTENDANCE_REPORT_WORKER_INTERVAL_MS);
};

export const stopDailyAttendanceReportJob = (): void => {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
};
