import type { Server } from "node:http";
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
import {
  startWhatsappMessageCostSyncJob,
  stopWhatsappMessageCostSyncJob,
} from "./jobs/whatsapp-message-cost-sync.job";
import {
  startSystemLogRetentionJob,
  stopSystemLogRetentionJob,
} from "./jobs/system-log-retention.job";
import {
  initSystemLogPersistSink,
  shutdownSystemLogPersistSink,
} from "./utils/system-logs/persist-sink";
import { initiateFatalShutdown } from "./utils/system-logs/fatal-shutdown";
import { systemLogger } from "./utils/system-logs/logger";
import { registerOrderedShutdown, runOrderedShutdown } from "./utils/process-lifecycle";

let httpServer: Server | null = null;
let shuttingDown = false;

const stopAllSchedulers = (): void => {
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
  stopWhatsappMessageCostSyncJob();
  stopSystemLogRetentionJob();
};

const closeHttpServer = async (): Promise<void> => {
  if (!httpServer) {
    return;
  }
  const server = httpServer;
  httpServer = null;
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
    setTimeout(resolve, 5_000).unref?.();
  });
};

const performOrderedShutdown = async (): Promise<void> => {
  await closeHttpServer();
  stopAllSchedulers();
  await shutdownSystemLogPersistSink({ timeoutMs: 5_000 });
  await closeDatabase();
};

registerOrderedShutdown(performOrderedShutdown);

const gracefulShutdown = async (exitCode = 0): Promise<void> => {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  try {
    await runOrderedShutdown();
  } catch (error) {
    systemLogger.error({
      module: "http",
      event: "http.request.failed",
      message: "Graceful shutdown encountered an error",
      error,
    });
  } finally {
    process.exit(exitCode);
  }
};

const startServer = async (): Promise<void> => {
  await connectDatabase();
  initSystemLogPersistSink();
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
  startWhatsappMessageCostSyncJob();
  startSystemLogRetentionJob();

  httpServer = app.listen(env.PORT, "0.0.0.0", () => {
    console.log(`API listening on 0.0.0.0:${env.PORT}`);
  });
};

process.on("SIGINT", () => {
  void gracefulShutdown(0);
});
process.on("SIGTERM", () => {
  void gracefulShutdown(0);
});

/**
 * Unhandled rejections: log + keep process alive (Node default historically).
 * Escalation to fatal would risk dropping in-flight attendance/webhooks.
 * Track via process.unhandledRejection system logs.
 */
process.on("unhandledRejection", (reason) => {
  systemLogger.error({
    module: "http",
    event: "process.unhandledRejection",
    message: "Unhandled promise rejection",
    error: reason instanceof Error ? reason : new Error(String(reason)),
  });
});

process.on("uncaughtException", (error) => {
  initiateFatalShutdown({
    event: "process.uncaughtException",
    message: "Uncaught exception",
    error,
  });
});

void startServer().catch((error) => {
  console.error("Failed to start server.", error);
  void closeDatabase().finally(() => {
    process.exit(1);
  });
});
