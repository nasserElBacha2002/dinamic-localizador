import { env } from "../config/env";
import { companyLifecycleService } from "../services/company-lifecycle.service";

let intervalHandle: NodeJS.Timeout | null = null;
let isRunning = false;

const runJobSafely = async (): Promise<void> => {
  if (isRunning) {
    console.info("[company-deletion-job] previous run still in progress, skipping tick");
    return;
  }
  if (!env.COMPANY_DELETION_JOB_ENABLED) {
    return;
  }

  isRunning = true;
  try {
    const result = await companyLifecycleService.processDueDeletions();
    if (result.processed > 0) {
      console.info("[company-deletion-job] tick complete", result);
    }
  } catch (error) {
    console.error("[company-deletion-job] unexpected job error", {
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    isRunning = false;
  }
};

export const startCompanyDeletionJob = (): void => {
  if (intervalHandle) {
    return;
  }
  console.info(
    `[company-deletion-job] starting scheduler (every ${env.COMPANY_DELETION_JOB_INTERVAL_MS}ms)`,
  );
  void runJobSafely();
  intervalHandle = setInterval(() => {
    void runJobSafely();
  }, env.COMPANY_DELETION_JOB_INTERVAL_MS);
};

export const stopCompanyDeletionJob = (): void => {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
};
