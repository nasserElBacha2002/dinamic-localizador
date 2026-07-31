import { absenceWorkdaySyncService } from "../services/absence-workday-sync.service";

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
    const result = await absenceWorkdaySyncService.processPendingJobs(25);
    if (result.processed > 0 || result.failed > 0) {
      console.info("[absence-workday-sync-job] tick complete", result);
    }
  } catch (error) {
    console.error("[absence-workday-sync-job] unexpected job error", {
      error: error instanceof Error ? error.message : String(error),
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
