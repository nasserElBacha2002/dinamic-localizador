import { env } from "../../config/env";
import type { AdminAlertType, AdminAlertTemplateCategory } from "../../constants/admin-alert";
import type {
  AdminAlertOperationalTemplatePayload,
  AdminAlertTemplatePayload,
} from "../../types/admin-alert";
import { isAdminAlertRequestPayload } from "../../types/admin-alert";
import { formatLocalTime } from "../attendance-validation";
import { formatServiceReferenceFromFields } from "../format-service-reference";
import { buildAdminRequestAlertTemplateVariables } from "./request-template-variables";

const EMPTY_CONTEXT = "—";

const formatLocalDate = (iso: string, timeZone: string): string =>
  new Intl.DateTimeFormat("es-AR", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));

const formatOperationContext = (payload: AdminAlertOperationalTemplatePayload): string => {
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

const formatMissingCheckinContext = (payload: AdminAlertOperationalTemplatePayload): string => {
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

const formatAttendanceThresholdDetail = (
  payload: AdminAlertOperationalTemplatePayload,
): string => {
  const rate = payload.attendanceRatePercent;
  const threshold = payload.attendanceThresholdPercent;
  if (rate == null || threshold == null) {
    return "La asistencia cruzó por debajo del umbral configurado.";
  }
  return `La asistencia actual es ${rate}%, por debajo del umbral configurado de ${threshold}%.`;
};

const formatAttendanceThresholdContext = (
  payload: AdminAlertOperationalTemplatePayload,
): string => {
  const windowDays = payload.attendanceWindowDays;
  const evaluated = payload.attendanceEvaluatedWorkdays;
  if (windowDays == null || evaluated == null) {
    return EMPTY_CONTEXT;
  }
  return `Últimos ${windowDays} días · ${evaluated} jornadas evaluadas`;
};

const alertCopyByType: Record<
  AdminAlertType,
  {
    title: string;
    detail: (payload: AdminAlertOperationalTemplatePayload) => string;
    context: (payload: AdminAlertOperationalTemplatePayload) => string;
  }
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
  ABSENCE_REQUEST_PENDING: {
    title: "Solicitud pendiente",
    detail: () => EMPTY_CONTEXT,
    context: () => EMPTY_CONTEXT,
  },
  ATTENDANCE_THRESHOLD_CROSSED: {
    title: "Asistencia baja",
    detail: formatAttendanceThresholdDetail,
    context: formatAttendanceThresholdContext,
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
  payload: AdminAlertOperationalTemplatePayload,
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
  if (category === "REQUEST" || alertType === "ABSENCE_REQUEST_PENDING") {
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
    if (!isAdminAlertRequestPayload(payload, category)) {
      throw new Error(
        "REQUEST admin alert requires AdminAlertRequestTemplatePayload (employeeName, absenceTypeName, startDate, endDate, statusLabel)",
      );
    }
    return buildAdminRequestAlertTemplateVariables(payload);
  }
  return buildAdminOperationalAlertTemplateVariables(
    alertType,
    payload as AdminAlertOperationalTemplatePayload,
  );
};
