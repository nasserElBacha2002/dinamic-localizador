import { env } from "../../config/env";
import type { AdminAlertType, AdminAlertTemplateCategory } from "../../constants/admin-alert";
import type {
  AdminAlertOperationalTemplatePayload,
  AdminAlertTemplatePayload,
} from "../../types/admin-alert";
import { isAdminAlertRequestPayload } from "../../types/admin-alert";
import { formatLocalTime } from "../attendance/attendance-validation";
import { formatServiceReferenceFromFields } from "../operations/format-service-reference";
import {
  buildAdminRequestAlertTemplateVariables,
  formatAbsenceRequestPeriodDisplay,
} from "./request-template-variables";
import { ABSENCE_REQUEST_PENDING_STATUS_LABEL } from "../../constants/admin-alert";

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
  // Replacement requests are enqueued directly with the approved seven-variable
  // template snapshot; this fallback only keeps generic alert contracts exhaustive.
  REPLACEMENT_REQUEST: {
    title: "Reemplazo requerido",
    detail: () => "Se requiere cubrir una jornada.",
    context: formatOperationContext,
  },
  MISSING_CHECKIN_AFTER_OPERATION: {
    title: "Sin registro de llegada",
    detail: () => "No existe registro de llegada al finalizar la jornada.",
    context: formatMissingCheckinContext,
  },
  ATTENDANCE_CONFIRMATION_MISSING: {
    title: "Confirmación pendiente",
    detail: (payload) => {
      const minutes = payload.minutesUntilStart;
      if (minutes == null) {
        return "Todavía no confirmó su asistencia.";
      }
      return `Todavía no confirmó su asistencia. Faltan ${minutes} min para el inicio.`;
    },
    context: formatOperationContext,
  },
  MISSING_CHECKIN_AFTER_START: {
    title: "Falta de llegada",
    detail: (payload) => {
      const minutes = payload.minutesLate;
      if (minutes == null) {
        return "Todavía no registró su llegada.";
      }
      return `Todavía no registró su llegada. Demora actual: ${minutes} min.`;
    },
    context: formatOperationContext,
  },
  MISSING_CHECKOUT_AFTER_END: {
    title: "Salida pendiente",
    detail: (payload) => {
      const minutes = payload.minutesLate;
      if (minutes == null) {
        return "Todavía no registró su salida.";
      }
      return `Todavía no registró su salida. Tiempo transcurrido: ${minutes} min.`;
    },
    context: (payload) => {
      const timeZone = payload.operationTimezone?.trim() || env.BOT_OPERATION_TIMEZONE;
      const serviceRef = formatServiceReferenceFromFields({
        serviceName: payload.serviceName ?? "",
        serviceAddress: payload.serviceAddress,
        serviceLocality: payload.serviceLocality,
      });
      if (!serviceRef.trim()) {
        return EMPTY_CONTEXT;
      }
      const endIso = payload.scheduledEnd ?? payload.scheduledStart;
      if (!endIso) {
        return `Operación: ${serviceRef}`;
      }
      const datePart = formatLocalDate(endIso, timeZone);
      const timePart = formatLocalTime(endIso, timeZone);
      return `Operación: ${serviceRef} · Fin ${datePart} ${timePart}`;
    },
  },
  FORWARDED_LOCATION_REJECTED: {
    title: "Ubicación reenviada",
    detail: (payload) =>
      payload.forwardedLocationDetail?.trim() ||
      "Intentó registrar asistencia con una ubicación marcada como reenviada por el proveedor.",
    context: formatOperationContext,
  },
  ABSENCE_REQUEST_PENDING: {
    title: "Nueva solicitud de ausencia",
    detail: (payload) => formatAbsencePendingOperationalDetail(payload),
    context: (payload) =>
      payload.absenceDetailUrl?.trim() ? payload.absenceDetailUrl.trim() : EMPTY_CONTEXT,
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

const formatAbsencePendingDays = (totalDays: number): string => {
  if (Number.isInteger(totalDays)) {
    return `${totalDays} ${totalDays === 1 ? "día" : "días"}`;
  }
  return `${totalDays.toLocaleString("es-AR", { maximumFractionDigits: 1 })} días`;
};

export const formatAbsencePendingOperationalDetail = (
  payload: AdminAlertOperationalTemplatePayload,
): string => {
  const parts: string[] = [];
  const typeName = payload.absenceTypeName?.trim();
  if (typeName) {
    parts.push(typeName);
  }
  const start = payload.absenceStartDate?.trim();
  const end = payload.absenceEndDate?.trim();
  if (start && end) {
    parts.push(formatAbsenceRequestPeriodDisplay(start, end));
  }
  if (payload.absenceTotalDays != null && Number.isFinite(Number(payload.absenceTotalDays))) {
    parts.push(formatAbsencePendingDays(Number(payload.absenceTotalDays)));
  }
  parts.push(
    payload.absenceStatusLabel?.trim() || ABSENCE_REQUEST_PENDING_STATUS_LABEL,
  );
  return parts.length > 0 ? parts.join(" · ") : EMPTY_CONTEXT;
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
  _alertType: AdminAlertType,
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
