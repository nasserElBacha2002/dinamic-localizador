import { app } from "./app";
import { env } from "./config/env";
import { closeDatabase, connectDatabase } from "./database/connection";
import { warnOnDuplicateTwilioContentSids } from "./utils/whatsapp-notification-observability";
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
  startWhatsappRetentionCleanupJob,
  stopWhatsappRetentionCleanupJob,
} from "./jobs/whatsapp-retention-cleanup.job";
import {
  startCompanyDeletionJob,
  stopCompanyDeletionJob,
} from "./jobs/company-deletion.job";
import {
  startPayrollReceiptNotificationJob,
  stopPayrollReceiptNotificationJob,
} from "./jobs/payroll-receipt-notification.job";
import {
  startOperationAssignmentNotificationJob,
  stopOperationAssignmentNotificationJob,
} from "./jobs/operation-assignment-notification.job";
import {
  startAdminAlertJob,
  stopAdminAlertJob,
} from "./jobs/admin-alert.job";
import {
  startOperationLifecycleJob,
  stopOperationLifecycleJob,
} from "./jobs/operation-lifecycle.job";

const startServer = async (): Promise<void> => {
  await connectDatabase();
  warnOnDuplicateTwilioContentSids({
    ARRIVAL: env.TWILIO_ARRIVAL_REMINDER_CONTENT_SID,
    EXIT: env.TWILIO_EXIT_REMINDER_CONTENT_SID,
    NO_CHECKIN: env.TWILIO_TEMPLATE_NO_CHECKIN_SID,
    ATTENDANCE_CONFIRMATION: env.TWILIO_ATTENDANCE_CONFIRMATION_CONTENT_SID,
    EVENTUAL_ASSIGNMENT: env.TWILIO_EVENTUAL_OPERATION_ASSIGNED_CONTENT_SID,
    ADMIN_OPERATIONAL: env.TWILIO_ADMIN_OPERATIONAL_ALERT_CONTENT_SID,
    ADMIN_REQUEST: env.TWILIO_ADMIN_REQUEST_ALERT_CONTENT_SID,
  });
  startAttendanceReminderJob();
  startRecurringWorkdayMaterializationJob();
  startAbsenceWorkdaySyncJob();
  startAbsenceAttachmentCleanupJob();
  startWhatsappRetentionCleanupJob();
  startCompanyDeletionJob();
  startPayrollReceiptNotificationJob();
  startOperationAssignmentNotificationJob();
  startOperationLifecycleJob();
  startAdminAlertJob();

  app.listen(env.PORT, "0.0.0.0", () => {
    console.log(`API listening on 0.0.0.0:${env.PORT}`);
  });
};

const shutdown = async (): Promise<void> => {
  stopAttendanceReminderJob();
  stopRecurringWorkdayMaterializationJob();
  stopAbsenceWorkdaySyncJob();
  stopAbsenceAttachmentCleanupJob();
  stopWhatsappRetentionCleanupJob();
  stopCompanyDeletionJob();
  stopPayrollReceiptNotificationJob();
  stopOperationAssignmentNotificationJob();
  stopOperationLifecycleJob();
  stopAdminAlertJob();
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
