import type { AttendanceNotification } from "../types/attendance-notification";

export const getNotificationLastActivityAt = (
  notification: Pick<AttendanceNotification, "lastAttemptAt" | "createdAt">,
): Date => new Date(notification.lastAttemptAt ?? notification.createdAt);

export const isNotificationRetryable = (
  notification: Pick<AttendanceNotification, "status" | "attemptCount" | "lastAttemptAt" | "createdAt">,
  staleBefore: Date,
  maxAttempts: number,
): boolean => {
  if (notification.status === "SENT") {
    return false;
  }

  if (notification.status === "FAILED") {
    return notification.attemptCount < maxAttempts;
  }

  if (notification.status === "PENDING") {
    return getNotificationLastActivityAt(notification) < staleBefore;
  }

  return false;
};

export const isFirstAttemptClaimable = (
  notification: Pick<AttendanceNotification, "status" | "attemptCount" | "lastAttemptAt">,
): boolean =>
  notification.status === "PENDING" &&
  notification.attemptCount === 0 &&
  notification.lastAttemptAt === null;

export const isBeginAttemptAllowed = (
  notification: Pick<AttendanceNotification, "status" | "attemptCount">,
  maxAttempts: number,
): boolean => notification.status === "PENDING" && notification.attemptCount < maxAttempts;
