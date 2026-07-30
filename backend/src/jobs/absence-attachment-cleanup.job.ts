import { env } from "../config/env";
import { absenceAttachmentService } from "../services/absence-attachment.service";

const JOB_INTERVAL_MS = 120_000;

let intervalHandle: NodeJS.Timeout | null = null;
let isRunning = false;

const runJobSafely = async (): Promise<void> => {
  if (isRunning) {
    console.info("[absence-attachment-cleanup-job] previous run still in progress, skipping tick");
    return;
  }
  if (!env.ABSENCE_ATTACHMENT_CLEANUP_JOB_ENABLED) {
    return;
  }

  isRunning = true;
  try {
    const result = await absenceAttachmentService.processCleanupBatch(25);
    if (result.processed > 0) {
      console.info("[absence-attachment-cleanup-job] tick complete", result);
    }
  } catch (error) {
    console.error("[absence-attachment-cleanup-job] unexpected job error", {
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    isRunning = false;
  }
};

export const startAbsenceAttachmentCleanupJob = (): void => {
  if (intervalHandle) {
    return;
  }
  console.info("[absence-attachment-cleanup-job] starting scheduler (every 120s)");
  void runJobSafely();
  intervalHandle = setInterval(() => {
    void runJobSafely();
  }, JOB_INTERVAL_MS);
};

export const stopAbsenceAttachmentCleanupJob = (): void => {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
};
