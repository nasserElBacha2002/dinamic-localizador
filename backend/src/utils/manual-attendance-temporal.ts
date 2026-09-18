import type { OperationWorkday } from "../types/workday";
import { AppError } from "../errors/app-error";

/**
 * Manual corrections may fall outside the normal WhatsApp check-in window, but must
 * still be associated with the selected workday. Bound by the schedule interval with a
 * fixed absolute margin so overnight shifts remain valid without hardcoding a timezone.
 */
const MANUAL_OCCURRED_AT_MARGIN_MS = 48 * 60 * 60 * 1000;

export const assertOccurredAtCompatibleWithWorkday = (
  schedule: Pick<OperationWorkday, "expectedStartAt" | "expectedEndAt">,
  occurredAt: Date,
): void => {
  if (Number.isNaN(occurredAt.getTime())) {
    throw new AppError(400, "INVALID_OCCURRED_AT", "La fecha/hora indicada no es válida.");
  }

  const startMs = new Date(schedule.expectedStartAt).getTime();
  const endMs = schedule.expectedEndAt
    ? new Date(schedule.expectedEndAt).getTime()
    : startMs;
  const lower = Math.min(startMs, endMs) - MANUAL_OCCURRED_AT_MARGIN_MS;
  const upper = Math.max(startMs, endMs) + MANUAL_OCCURRED_AT_MARGIN_MS;
  const at = occurredAt.getTime();

  if (at < lower || at > upper) {
    throw new AppError(
      400,
      "OCCURRED_AT_OUTSIDE_WORKDAY",
      "La fecha/hora no es compatible con la jornada seleccionada.",
    );
  }
};
