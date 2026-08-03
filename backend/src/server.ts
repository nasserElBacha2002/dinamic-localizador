import { app } from "./app";
import { env } from "./config/env";
import { closeDatabase, connectDatabase } from "./database/connection";
import { startAbsenceWorkdaySyncJob, stopAbsenceWorkdaySyncJob } from "./jobs/absence-workday-sync.job";
import {
  startAbsenceAttachmentCleanupJob,
  stopAbsenceAttachmentCleanupJob,
} from "./jobs/absence-attachment-cleanup.job";
import { startAttendanceReminderJob, stopAttendanceReminderJob } from "./jobs/attendance-reminder.job";
import {
  startRecurringWorkdayMaterializationJob,
  stopRecurringWorkdayMaterializationJob,
} from "./jobs/recurring-workday-materialization.job";
import {
  startWhatsappObservabilityCleanupJob,
  stopWhatsappObservabilityCleanupJob,
} from "./jobs/whatsapp-observability-cleanup.job";

const startServer = async (): Promise<void> => {
  await connectDatabase();
  startAttendanceReminderJob();
  startRecurringWorkdayMaterializationJob();
  startAbsenceWorkdaySyncJob();
  startAbsenceAttachmentCleanupJob();
  startWhatsappObservabilityCleanupJob();

  app.listen(env.PORT, () => {
    console.log(`API listening on port ${env.PORT}`);
  });
};

const shutdown = async (): Promise<void> => {
  stopAttendanceReminderJob();
  stopRecurringWorkdayMaterializationJob();
  stopAbsenceWorkdaySyncJob();
  stopAbsenceAttachmentCleanupJob();
  stopWhatsappObservabilityCleanupJob();
  await closeDatabase();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

void startServer().catch((error) => {
  console.error("Failed to start server.", error);
  void closeDatabase().finally(() => {
    process.exit(1);
  });
});
