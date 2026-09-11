import { absenceWorkdaySyncService } from "../services/absence-workday-sync.service";
import { runInstrumentedJobTick } from "../utils/system-logs/job-tick";

const JOB_INTERVAL_MS = 60_000;

let intervalHandle: NodeJS.Timeout | null = null;
let isRunning = false;

const runJobSafely = async (): Promise<void> => {
  if (isRunning) {
    console.info("[absence-workday-sync-job] previous run still in progress, skipping tick");
    return;
  }

  isRunning = true;
  try {
    await runInstrumentedJobTick({
      module: "absence",
      jobName: "absence-workday-sync",
      completedEvent: "absence-sync.run.completed",
      failedEvent: "absence-sync.run.failed",
      completedMessage: "Absence workday sync tick completed",
      failedMessage: "Absence workday sync job failed",
      run: async () => {
        const result = await absenceWorkdaySyncService.processPendingJobs(25);
        return { processed: result.processed, failed: result.failed };
      },
    });
  } finally {
    isRunning = false;
  }
};

export const startAbsenceWorkdaySyncJob = (): void => {
  if (intervalHandle) {
    return;
  }
  console.info("[absence-workday-sync-job] starting scheduler (every 60s)");
  void runJobSafely();
  intervalHandle = setInterval(() => {
    void runJobSafely();
  }, JOB_INTERVAL_MS);
};

export const stopAbsenceWorkdaySyncJob = (): void => {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
};
