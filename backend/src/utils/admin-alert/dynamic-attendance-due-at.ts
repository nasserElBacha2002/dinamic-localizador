/**
 * Central due-at calculations for dynamic admin attendance alerts (UTC instants).
 */

export const computeConfirmationMissingDueAt = (
  scheduledStart: Date,
  confirmationEscalationMinutes: number,
): Date =>
  new Date(scheduledStart.getTime() - confirmationEscalationMinutes * 60_000);

export const computeMissingCheckinAfterStartDueAt = (
  scheduledStart: Date,
  lateArrivalToleranceMinutes: number,
): Date =>
  new Date(scheduledStart.getTime() + lateArrivalToleranceMinutes * 60_000);

export const computeMissingCheckoutAfterEndDueAt = (
  scheduledEnd: Date,
  missingCheckoutDelayMinutes: number,
): Date =>
  new Date(scheduledEnd.getTime() + missingCheckoutDelayMinutes * 60_000);

/**
 * Eligible when dueAt has been reached but is not older than maxLateness.
 * Optional watermark (admin_alerts_enabled_at) blocks historical backfill.
 */
export const isDueWithinMaxLateness = (
  dueAt: Date,
  referenceAt: Date,
  maxLatenessMinutes: number,
  watermarkAt?: Date | null,
): boolean => {
  if (maxLatenessMinutes < 1) {
    return false;
  }
  const dueMs = dueAt.getTime();
  const nowMs = referenceAt.getTime();
  if (Number.isNaN(dueMs) || Number.isNaN(nowMs)) {
    return false;
  }
  if (dueMs > nowMs) {
    return false;
  }
  const earliest = nowMs - maxLatenessMinutes * 60_000;
  if (dueMs < earliest) {
    return false;
  }
  if (watermarkAt) {
    const watermarkMs = watermarkAt.getTime();
    if (!Number.isNaN(watermarkMs) && dueMs < watermarkMs) {
      return false;
    }
  }
  return true;
};

export const minutesBetween = (from: Date, to: Date): number =>
  Math.max(0, Math.floor((to.getTime() - from.getTime()) / 60_000));
