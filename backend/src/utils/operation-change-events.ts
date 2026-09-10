import type { Operation } from "../types/domain";
import { getDateIsoInTimezone } from "./absence-date";
import { detectOperationBusinessChanges } from "./operational-incident-statistics";
import type { OperationChangeAction } from "../repositories/operation-change-event.repository";
import { DEFAULT_OPERATION_TIMEZONE } from "./operation-timezone";

const toCalendarDateString = (value: string | Date | null | undefined): string | null => {
  if (!value) {
    return null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      return trimmed.slice(0, 10);
    }
    return null;
  }
  return null;
};

const toDate = (value: string | Date): Date | null => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/**
 * Resolve the calendar operational date for an operation in company timezone.
 * Prefer explicit workDate (already a calendar date); otherwise convert scheduledStart
 * via getDateIsoInTimezone so near-midnight UTC does not shift the local day.
 */
export const resolveOperationOperationalDate = (
  operation: {
    scheduledStart?: string | Date | null;
    workDate?: string | null;
  },
  timezone?: string | null,
): string => {
  const tz = timezone?.trim() || DEFAULT_OPERATION_TIMEZONE;
  const fromWork = toCalendarDateString(operation.workDate ?? null);
  if (fromWork) {
    return fromWork;
  }

  if (operation.scheduledStart != null) {
    const plain = toCalendarDateString(
      typeof operation.scheduledStart === "string" ? operation.scheduledStart : null,
    );
    if (plain && typeof operation.scheduledStart === "string") {
      const trimmed = operation.scheduledStart.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        return plain;
      }
    }
    const start = toDate(operation.scheduledStart);
    if (start) {
      return getDateIsoInTimezone(start, tz);
    }
  }

  return getDateIsoInTimezone(new Date(), tz);
};

export const buildOperationChangePayload = (input: {
  previous: Operation;
  next: Operation;
  action: "update" | "cancel" | "reactivate";
  timezone?: string | null;
}): {
  changeAction: OperationChangeAction;
  changedFields: string[];
  operationalDate: string;
} | null => {
  if (input.action === "cancel") {
    return {
      changeAction: "CANCEL",
      changedFields: ["status"],
      operationalDate: resolveOperationOperationalDate(input.next, input.timezone),
    };
  }
  if (input.action === "reactivate") {
    return {
      changeAction: "REACTIVATE",
      changedFields: ["status"],
      operationalDate: resolveOperationOperationalDate(input.next, input.timezone),
    };
  }

  const prev = input.previous as unknown as Record<string, unknown>;
  const next = input.next as unknown as Record<string, unknown>;
  const changedFields = detectOperationBusinessChanges(prev, next);
  if (changedFields.length === 0) {
    return null;
  }

  const scheduleChanged =
    changedFields.includes("scheduledStart") || changedFields.includes("scheduledEnd");

  return {
    changeAction: scheduleChanged ? "RESCHEDULE" : "UPDATE",
    changedFields,
    operationalDate: resolveOperationOperationalDate(input.next, input.timezone),
  };
};
