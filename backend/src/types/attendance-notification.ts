import type {
  AttendanceNotificationStatus,
  AttendanceNotificationType,
} from "../constants/attendance-notification";

export interface AttendanceNotification {
  id: string;
  inventoryId: string;
  employeeId: string;
  notificationType: AttendanceNotificationType;
  twilioMessageSid: string | null;
  status: AttendanceNotificationStatus;
  errorMessage: string | null;
  sentAt: string | null;
  createdAt: string;
}

export interface AttendanceReminderCandidate {
  inventoryId: string;
  employeeId: string;
  employeeName: string;
  employeePhoneNumber: string;
  storeName: string;
  scheduledStart: string;
  scheduledEnd: string | null;
}
