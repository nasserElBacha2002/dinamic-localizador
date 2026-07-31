import type {
  AttendanceNotificationStatus,
  AttendanceNotificationType,
} from "../constants/attendance-notification";

export interface AttendanceNotification {
  id: string;
  operationId: string;
  employeeId: string;
  notificationType: AttendanceNotificationType;
  twilioMessageSid: string | null;
  status: AttendanceNotificationStatus;
  errorMessage: string | null;
  sentAt: string | null;
  attemptCount: number;
  lastAttemptAt: string | null;
  createdAt: string;
}

export interface AttendanceReminderCandidate {
  operationId: string;
  employeeId: string;
  employeeName: string;
  employeePhoneNumber: string;
  serviceName: string;
  serviceAddress: string | null;
  serviceLocality: string | null;
  /** Workday expected start (preferred) or operation scheduled_start for confirmation. */
  scheduledStart: string;
  /** Workday expected end (preferred) or operation scheduled_end. */
  scheduledEnd: string | null;
  scheduleVersion: number;
  confirmationReminderHoursBefore: number;
  operationTimezone?: string;
  operationKind?: "ONE_TIME" | "RECURRING" | string;
  employeeWorkdayId?: string;
  operationWorkdayId?: string;
}
