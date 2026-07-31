import { connectDatabase, closeDatabase } from "../database/connection";
import { attendanceReminderService } from "../services/attendance-reminder.service";
import { companyContextService } from "../services/company-context.service";
import type { AttendanceNotificationType } from "../constants/attendance-notification";
import { ATTENDANCE_NOTIFICATION_TYPES } from "../constants/attendance-notification";

const readArg = (name: string): string | undefined => {
  const prefix = `--${name}=`;
  const inlineArg = process.argv.find((arg) => arg.startsWith(prefix));
  if (inlineArg) {
    return inlineArg.slice(prefix.length);
  }

  return undefined;
};

const printUsage = (): void => {
  console.error(`Usage:
  npm run reminders:run

  npm run reminders:test -- --type=ARRIVAL_REMINDER_15_MIN --operation-id=UUID --employee-id=UUID
  npm run reminders:test -- --type=EXIT_REMINDER_15_MIN --operation-id=UUID --employee-id=UUID
  npm run reminders:test -- --type=NO_CHECKIN_AT_START --operation-id=UUID --employee-id=UUID
  npm run reminders:test -- --type=ARRIVAL_REMINDER_15_MIN --operation-id=UUID --employee-id=UUID --employee-workday-id=UUID --schedule-version=20260731

Supported types: ${ATTENDANCE_NOTIFICATION_TYPES.join(", ")}`);
};

const main = async (): Promise<void> => {
  const mode = process.argv[2];

  await connectDatabase();

  try {
    if (!mode || mode === "run") {
      const summary = await attendanceReminderService.runDueRemindersForAllCompanies();
      console.info(JSON.stringify(summary, null, 2));
      return;
    }

    if (mode === "test") {
      const notificationType = readArg("type") as AttendanceNotificationType | undefined;
      const operationId = readArg("operation-id") ?? readArg("invent" + "ory-id");
      const employeeId = readArg("employee-id");

      if (!notificationType || !operationId || !employeeId) {
        printUsage();
        process.exit(1);
      }

      if (!ATTENDANCE_NOTIFICATION_TYPES.includes(notificationType)) {
        console.error(`Invalid notification type: ${notificationType}`);
        printUsage();
        process.exit(1);
      }

      const companyId = await companyContextService.resolveDefaultCompanyId();
      const employeeWorkdayId = readArg("employee-workday-id");
      const operationWorkdayId = readArg("operation-workday-id");
      const scheduleVersionRaw = readArg("schedule-version");
      const scheduleVersion = scheduleVersionRaw ? Number(scheduleVersionRaw) : undefined;
      if (scheduleVersionRaw && !Number.isFinite(scheduleVersion)) {
        console.error(`Invalid schedule-version: ${scheduleVersionRaw}`);
        process.exit(1);
      }

      const outcome = await attendanceReminderService.sendTestReminder(companyId, {
        notificationType,
        operationId,
        employeeId,
        employeeWorkdayId,
        operationWorkdayId,
        scheduleVersion,
      });

      console.info(
        JSON.stringify(
          {
            status: "ok",
            outcome,
            notificationType,
            operationId,
            employeeId,
            employeeWorkdayId: employeeWorkdayId ?? null,
            operationWorkdayId: operationWorkdayId ?? null,
            scheduleVersion: scheduleVersion ?? null,
          },
          null,
          2,
        ),
      );
      return;
    }

    printUsage();
    process.exit(1);
  } finally {
    await closeDatabase();
  }
};

void main().catch((error) => {
  console.error("Attendance reminder script failed:", error);
  void closeDatabase().finally(() => {
    process.exit(1);
  });
});
