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
  scheduledStart: string;
  scheduledEnd: string | null;
  scheduleVersion: number;
  confirmationReminderHoursBefore: number;
  operationTimezone?: string;
}
