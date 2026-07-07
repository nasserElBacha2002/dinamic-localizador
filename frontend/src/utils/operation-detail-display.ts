import type { OperationFormValues } from "../schemas/operation.schema";
import type { OperationDetail, UpdateOperationInput } from "../types/operation";
import { createDefaultWeeklySchedule, type WeeklyScheduleDay } from "../types/schedule";
import { datetimeLocalToIso, formatDateTime, isoToDatetimeLocal } from "./dates";

export function buildOperationEditDefaultValues(operation: OperationDetail): OperationFormValues {
  const schedule = operation.schedule;

  return {
    operationKind: operation.operationKind ?? "ONE_TIME",
    serviceId: operation.serviceId,
    scheduledStart: operation.scheduledStart ? isoToDatetimeLocal(operation.scheduledStart) : "",
    scheduledEnd: operation.scheduledEnd ? isoToDatetimeLocal(operation.scheduledEnd) : "",
    validFrom: schedule?.validFrom ?? "",
    validUntil: schedule?.validUntil ?? "",
    scheduleSource: schedule?.scheduleSource ?? "COMPANY",
    scheduleDays: schedule?.days ?? createDefaultWeeklySchedule(),
    earlyToleranceMinutes: operation.earlyToleranceMinutes,
    lateToleranceMinutes: operation.lateToleranceMinutes,
    notes: operation.notes ?? "",
    status: operation.status,
  };
}

export function toOperationUpdatePayload(
  operation: OperationDetail,
  values: OperationFormValues,
): UpdateOperationInput {
  const shared = {
    serviceId: values.serviceId,
    earlyToleranceMinutes: values.earlyToleranceMinutes,
    lateToleranceMinutes: values.lateToleranceMinutes,
    notes: values.notes?.trim() ? values.notes.trim() : null,
    status: values.status,
  };

  if ((operation.operationKind ?? "ONE_TIME") === "RECURRING") {
    return {
      ...shared,
      validFrom: values.validFrom,
      validUntil: values.validUntil?.trim() ? values.validUntil : null,
      scheduleSource: values.scheduleSource,
      ...(values.scheduleSource === "CUSTOM"
        ? { scheduleDays: values.scheduleDays as WeeklyScheduleDay[] }
        : {}),
    };
  }

  return {
    ...shared,
    scheduledStart: datetimeLocalToIso(values.scheduledStart),
    scheduledEnd: values.scheduledEnd ? datetimeLocalToIso(values.scheduledEnd) : null,
  };
}

export function resolveOperationReferenceDate(operation: OperationDetail): string {
  if (operation.operationKind === "RECURRING") {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Argentina/Buenos_Aires",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  }

  if (!operation.scheduledStart) {
    return "";
  }

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(operation.scheduledStart));
}

export function formatOperationDetailScheduleTitle(operation: OperationDetail): string {
  if (operation.operationKind === "RECURRING") {
    return `${operation.service.name} · Trabajo habitual`;
  }

  return `${operation.service.name} · ${operation.scheduledStart ? formatDateTime(operation.scheduledStart) : "—"}`;
}
