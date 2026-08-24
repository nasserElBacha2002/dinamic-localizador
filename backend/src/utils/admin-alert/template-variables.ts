import { env } from "../../config/env";
import type { AdminAlertType, AdminAlertTemplateCategory } from "../../constants/admin-alert";
import type { AdminAlertTemplatePayload } from "../../types/admin-alert";
import { formatLocalTime } from "../attendance-validation";
import { formatServiceReferenceFromFields } from "../format-service-reference";

const EMPTY_CONTEXT = "—";

const formatLocalDate = (iso: string, timeZone: string): string =>
  new Intl.DateTimeFormat("es-AR", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));

const formatOperationContext = (payload: AdminAlertTemplatePayload): string => {
  const timeZone = payload.operationTimezone?.trim() || env.BOT_OPERATION_TIMEZONE;
  const serviceRef = formatServiceReferenceFromFields({
    serviceName: payload.serviceName ?? "",
    serviceAddress: payload.serviceAddress,
    serviceLocality: payload.serviceLocality,
  });

  if (!serviceRef.trim()) {
    return EMPTY_CONTEXT;
  }

  if (!payload.scheduledStart) {
    return `Operación: ${serviceRef}`;
  }

  const datePart = formatLocalDate(payload.scheduledStart, timeZone);
  const timePart = formatLocalTime(payload.scheduledStart, timeZone);
  return `Operación: ${serviceRef} · ${datePart} ${timePart}`;
};

const formatMissingCheckinContext = (payload: AdminAlertTemplatePayload): string => {
  const timeZone = payload.operationTimezone?.trim() || env.BOT_OPERATION_TIMEZONE;
  const serviceRef = formatServiceReferenceFromFields({
    serviceName: payload.serviceName ?? "",
    serviceAddress: payload.serviceAddress,
    serviceLocality: payload.serviceLocality,
  });

  if (!serviceRef.trim()) {
    return EMPTY_CONTEXT;
  }

  const dateIso = payload.scheduledStart ?? payload.scheduledEnd;
  if (!dateIso) {
    return `Operación: ${serviceRef}`;
  }

  const datePart = formatLocalDate(dateIso, timeZone);
  return `Operación: ${serviceRef} · ${datePart}`;
};

const alertCopyByType: Record<
  AdminAlertType,
  { title: string; detail: (payload: AdminAlertTemplatePayload) => string; context: (payload: AdminAlertTemplatePayload) => string }
> = {
  EMPLOYEE_UNAVAILABLE: {
    title: "No asistirá",
    detail: () => "Informó que no podrá asistir.",
    context: formatOperationContext,
  },
  MISSING_CHECKIN_AFTER_OPERATION: {
    title: "Sin registro de llegada",
    detail: () => "No existe registro de llegada al finalizar la jornada.",
    context: formatMissingCheckinContext,
  },
  FORWARDED_LOCATION_REJECTED: {
    title: "Ubicación reenviada",
    detail: () => "Intentó registrar asistencia utilizando una ubicación reenviada.",
    context: (payload) => {
      const ctx = formatOperationContext(payload);
      return ctx === EMPTY_CONTEXT ? EMPTY_CONTEXT : ctx;
    },
  },
};

const sanitizeVariable = (value: string): string => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : EMPTY_CONTEXT;
};

/**
 * Twilio admin_operational_alert variables:
 * {{1}} alert title, {{2}} employee, {{3}} factual detail, {{4}} context
 */
export const buildAdminOperationalAlertTemplateVariables = (
  alertType: AdminAlertType,
  payload: AdminAlertTemplatePayload,
): Record<string, string> => {
  const copy = alertCopyByType[alertType];
  return {
    "1": sanitizeVariable(copy.title),
    "2": sanitizeVariable(payload.employeeName),
    "3": sanitizeVariable(copy.detail(payload)),
    "4": sanitizeVariable(copy.context(payload)),
  };
};

export const resolveTemplateCategoryForBuild = (
  alertType: AdminAlertType,
  category: AdminAlertTemplateCategory,
): "operational" | "request" => {
  if (category === "REQUEST") {
    return "request";
  }
  return "operational";
};

export const buildAdminAlertTemplateVariables = (
  alertType: AdminAlertType,
  category: AdminAlertTemplateCategory,
  payload: AdminAlertTemplatePayload,
): Record<string, string> => {
  const kind = resolveTemplateCategoryForBuild(alertType, category);
  if (kind === "request") {
    // Prepared for admin_request_alert; not used in Phase A+B emit paths.
    return {
      "1": sanitizeVariable(alertType),
      "2": sanitizeVariable(payload.employeeName),
      "3": EMPTY_CONTEXT,
      "4": EMPTY_CONTEXT,
    };
  }
  return buildAdminOperationalAlertTemplateVariables(alertType, payload);
};
