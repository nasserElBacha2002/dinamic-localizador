import { ABSENCE_REQUEST_PENDING_STATUS_LABEL } from "../../constants/admin-alert";
import type { AdminAlertRequestTemplatePayload } from "../../types/admin-alert";
import { formatAbsenceDateDisplay } from "../absence-date";

const EMPTY_CONTEXT = "—";

const sanitizeVariable = (value: string): string => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : EMPTY_CONTEXT;
};

/** Build "{{1}}" title: "Solicitud de {tipo}" without duplicating prefix. */
export const buildAbsenceRequestAlertTitle = (absenceTypeName: string): string => {
  const name = absenceTypeName.trim();
  if (!name) {
    return "Solicitud";
  }
  if (/^solicitud de\s+/i.test(name)) {
    return name;
  }
  const normalizedType =
    name.charAt(0).toLowerCase() === name.charAt(0)
      ? name
      : `${name.charAt(0).toLowerCase()}${name.slice(1)}`;
  return `Solicitud de ${normalizedType}`;
};

/** Calendar dates in DD/MM/YYYY; single day omits redundant range. */
export const formatAbsenceRequestPeriodDisplay = (
  startDate: string,
  endDate: string,
): string => {
  const start = formatAbsenceDateDisplay(startDate);
  if (startDate === endDate) {
    return start;
  }
  return `${start} – ${formatAbsenceDateDisplay(endDate)}`;
};

/**
 * Twilio admin_request_alert variables:
 * {{1}} request type title, {{2}} employee, {{3}} period, {{4}} status
 */
export const buildAdminRequestAlertTemplateVariables = (
  payload: AdminAlertRequestTemplatePayload,
): Record<string, string> => ({
  "1": sanitizeVariable(buildAbsenceRequestAlertTitle(payload.absenceTypeName)),
  "2": sanitizeVariable(payload.employeeName),
  "3": sanitizeVariable(formatAbsenceRequestPeriodDisplay(payload.startDate, payload.endDate)),
  "4": sanitizeVariable(payload.statusLabel || ABSENCE_REQUEST_PENDING_STATUS_LABEL),
});
