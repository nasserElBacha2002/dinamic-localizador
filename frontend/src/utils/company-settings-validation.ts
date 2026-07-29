import type { CompanySettingsFormValues } from "../types/company-settings";

const LIMITS = {
  defaultRadiusMeters: { min: 10, max: 5000 },
  geofenceReviewMarginMeters: { min: 0, max: 500 },
  lateGraceMinutes: { min: 0, max: 240 },
  earlyLeaveToleranceMinutes: { min: 0, max: 240 },
  operationToleranceMinutes: { min: 0, max: 240 },
  pendingOperationExpirationHours: { min: 1, max: 168 },
  operationTimezoneMaxLength: 80,
} as const;

const HHMM_PATTERN = /^([01]?\d|2[0-3]):[0-5]\d$/;

function isValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

function validateIntegerField(
  raw: string,
  label: string,
  min: number,
  max: number,
): string | null {
  const value = Number(raw.trim());
  if (!raw.trim() || !Number.isInteger(value) || value < min || value > max) {
    return `${label} debe ser un número entero entre ${min} y ${max}.`;
  }

  return null;
}

function validateOptionalIntegerField(
  raw: string,
  label: string,
  min: number,
  max: number,
): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const value = Number(trimmed);
  if (!Number.isInteger(value) || value < min || value > max) {
    return `${label} debe ser un número entero entre ${min} y ${max}.`;
  }

  return null;
}

function validateOptionalHHmm(raw: string, label: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  if (!HHMM_PATTERN.test(trimmed)) {
    return `${label} debe tener formato HH:mm válido.`;
  }

  return null;
}

export type CompanySettingsFieldKey =
  | "operationTimezone"
  | "defaultRadiusMeters"
  | "geofenceReviewMarginMeters"
  | "defaultOperationStartTime"
  | "defaultOperationEndTime"
  | "defaultEarlyArrivalToleranceMinutes"
  | "defaultLateArrivalToleranceMinutes"
  | "lateGraceMinutes"
  | "earlyLeaveToleranceMinutes"
  | "pendingOperationExpirationHours"
  | "confirmationReminderHoursBefore";

export type CompanySettingsFieldErrors = Partial<Record<CompanySettingsFieldKey, string>>;

function assignFieldError(
  errors: CompanySettingsFieldErrors,
  field: CompanySettingsFieldKey,
  message: string | null,
): void {
  if (message) {
    errors[field] = message;
  }
}

export function validateGeneralSettingsFields(
  values: Pick<CompanySettingsFormValues, "operationTimezone">,
): CompanySettingsFieldErrors {
  const errors: CompanySettingsFieldErrors = {};
  const timezone = values.operationTimezone.trim();

  if (!timezone) {
    errors.operationTimezone = "La zona horaria operativa es obligatoria.";
  } else if (timezone.length > LIMITS.operationTimezoneMaxLength) {
    errors.operationTimezone = "La zona horaria operativa no puede superar 80 caracteres.";
  } else if (!isValidTimezone(timezone)) {
    errors.operationTimezone = "La zona horaria operativa no es válida.";
  }

  return errors;
}

export function validateOperationOperationSettingsFields(
  values: Pick<
    CompanySettingsFormValues,
    | "defaultRadiusMeters"
    | "geofenceReviewMarginMeters"
    | "defaultOperationStartTime"
    | "defaultOperationEndTime"
    | "defaultEarlyArrivalToleranceMinutes"
    | "defaultLateArrivalToleranceMinutes"
  >,
): CompanySettingsFieldErrors {
  const errors: CompanySettingsFieldErrors = {};

  assignFieldError(
    errors,
    "defaultRadiusMeters",
    validateIntegerField(
      values.defaultRadiusMeters,
      "El radio permitido por defecto",
      LIMITS.defaultRadiusMeters.min,
      LIMITS.defaultRadiusMeters.max,
    ),
  );
  assignFieldError(
    errors,
    "geofenceReviewMarginMeters",
    validateOptionalIntegerField(
      values.geofenceReviewMarginMeters,
      "El margen de revisión de geocerca",
      LIMITS.geofenceReviewMarginMeters.min,
      LIMITS.geofenceReviewMarginMeters.max,
    ),
  );
  assignFieldError(
    errors,
    "defaultOperationStartTime",
    validateOptionalHHmm(values.defaultOperationStartTime, "El horario de inicio por defecto"),
  );
  assignFieldError(
    errors,
    "defaultOperationEndTime",
    validateOptionalHHmm(values.defaultOperationEndTime, "El horario de fin por defecto"),
  );
  assignFieldError(
    errors,
    "defaultEarlyArrivalToleranceMinutes",
    validateIntegerField(
      values.defaultEarlyArrivalToleranceMinutes,
      "La tolerancia de llegada temprana para operaciones",
      LIMITS.operationToleranceMinutes.min,
      LIMITS.operationToleranceMinutes.max,
    ),
  );
  assignFieldError(
    errors,
    "defaultLateArrivalToleranceMinutes",
    validateIntegerField(
      values.defaultLateArrivalToleranceMinutes,
      "La tolerancia de llegada tardía para operaciones",
      LIMITS.operationToleranceMinutes.min,
      LIMITS.operationToleranceMinutes.max,
    ),
  );

  return errors;
}

export function validateWhatsAppSettingsFields(
  values: Pick<
    CompanySettingsFormValues,
    "lateGraceMinutes" | "earlyLeaveToleranceMinutes" | "pendingOperationExpirationHours"
  >,
): CompanySettingsFieldErrors {
  const errors: CompanySettingsFieldErrors = {};

  assignFieldError(
    errors,
    "lateGraceMinutes",
    validateIntegerField(
      values.lateGraceMinutes,
      "La tolerancia de puntualidad WhatsApp",
      LIMITS.lateGraceMinutes.min,
      LIMITS.lateGraceMinutes.max,
    ),
  );
  assignFieldError(
    errors,
    "earlyLeaveToleranceMinutes",
    validateIntegerField(
      values.earlyLeaveToleranceMinutes,
      "La tolerancia de salida anticipada WhatsApp",
      LIMITS.earlyLeaveToleranceMinutes.min,
      LIMITS.earlyLeaveToleranceMinutes.max,
    ),
  );
  assignFieldError(
    errors,
    "pendingOperationExpirationHours",
    validateIntegerField(
      values.pendingOperationExpirationHours,
      "El vencimiento de salida pendiente",
      LIMITS.pendingOperationExpirationHours.min,
      LIMITS.pendingOperationExpirationHours.max,
    ),
  );

  return errors;
}

export function validateConfirmationReminderSettingsFields(
  values: Pick<
    CompanySettingsFormValues,
    "confirmationReminderEnabled" | "confirmationReminderHoursBefore"
  >,
): CompanySettingsFieldErrors {
  const errors: CompanySettingsFieldErrors = {};
  if (!values.confirmationReminderEnabled) {
    return errors;
  }

  assignFieldError(
    errors,
    "confirmationReminderHoursBefore",
    validateIntegerField(
      values.confirmationReminderHoursBefore,
      "Las horas del recordatorio de confirmación",
      1,
      168,
    ),
  );

  return errors;
}

/** Typed field-keyed validation for full company settings forms. */
export function validateCompanySettingsFields(
  values: CompanySettingsFormValues,
): CompanySettingsFieldErrors {
  return {
    ...validateGeneralSettingsFields(values),
    ...validateOperationOperationSettingsFields(values),
    ...validateWhatsAppSettingsFields(values),
  };
}

function fieldErrorsToMessages(errors: CompanySettingsFieldErrors): string[] {
  return Object.values(errors).filter((message): message is string => Boolean(message));
}

export function validateGeneralSettingsForm(
  values: Pick<CompanySettingsFormValues, "operationTimezone">,
): string[] {
  return fieldErrorsToMessages(validateGeneralSettingsFields(values));
}

export function validateOperationOperationSettingsForm(
  values: Pick<
    CompanySettingsFormValues,
    | "defaultRadiusMeters"
    | "geofenceReviewMarginMeters"
    | "defaultOperationStartTime"
    | "defaultOperationEndTime"
    | "defaultEarlyArrivalToleranceMinutes"
    | "defaultLateArrivalToleranceMinutes"
  >,
): string[] {
  return fieldErrorsToMessages(validateOperationOperationSettingsFields(values));
}

export function validateWhatsAppSettingsForm(
  values: Pick<
    CompanySettingsFormValues,
    "lateGraceMinutes" | "earlyLeaveToleranceMinutes" | "pendingOperationExpirationHours"
  >,
): string[] {
  return fieldErrorsToMessages(validateWhatsAppSettingsFields(values));
}

export function validateOperationalSettingsForm(
  values: OperationalSettingsFormValues,
): string[] {
  return fieldErrorsToMessages({
    ...validateGeneralSettingsFields(values),
    ...validateOperationOperationSettingsFields({
      ...values,
      geofenceReviewMarginMeters: "",
    }),
    ...validateWhatsAppSettingsFields(values),
    ...validateConfirmationReminderSettingsFields(values),
  });
}

export type OperationalSettingsFormValues = Pick<
  CompanySettingsFormValues,
  | "operationTimezone"
  | "defaultRadiusMeters"
  | "defaultOperationStartTime"
  | "defaultOperationEndTime"
  | "defaultEarlyArrivalToleranceMinutes"
  | "defaultLateArrivalToleranceMinutes"
  | "lateGraceMinutes"
  | "earlyLeaveToleranceMinutes"
  | "pendingOperationExpirationHours"
  | "confirmationReminderEnabled"
  | "confirmationReminderHoursBefore"
>;

export function validateConfirmationReminderSettingsForm(
  values: Pick<
    CompanySettingsFormValues,
    "confirmationReminderEnabled" | "confirmationReminderHoursBefore"
  >,
): string[] {
  return fieldErrorsToMessages(validateConfirmationReminderSettingsFields(values));
}

export function toOperationalSettingsFormValues(settings: {
  operationTimezone: string;
  defaultRadiusMeters: number;
  lateGraceMinutes: number;
  earlyLeaveToleranceMinutes: number;
  pendingOperationExpirationHours: number;
  defaultEarlyArrivalToleranceMinutes: number;
  defaultLateArrivalToleranceMinutes: number;
  defaultOperationStartTime: string | null;
  defaultOperationEndTime: string | null;
  confirmationReminderEnabled: boolean;
  confirmationReminderHoursBefore: number;
}): OperationalSettingsFormValues {
  return {
    operationTimezone: settings.operationTimezone,
    defaultRadiusMeters: String(settings.defaultRadiusMeters),
    defaultOperationStartTime: settings.defaultOperationStartTime ?? "",
    defaultOperationEndTime: settings.defaultOperationEndTime ?? "",
    defaultEarlyArrivalToleranceMinutes: String(settings.defaultEarlyArrivalToleranceMinutes),
    defaultLateArrivalToleranceMinutes: String(settings.defaultLateArrivalToleranceMinutes),
    lateGraceMinutes: String(settings.lateGraceMinutes),
    earlyLeaveToleranceMinutes: String(settings.earlyLeaveToleranceMinutes),
    pendingOperationExpirationHours: String(settings.pendingOperationExpirationHours),
    confirmationReminderEnabled: settings.confirmationReminderEnabled,
    confirmationReminderHoursBefore: String(settings.confirmationReminderHoursBefore),
  };
}

export function toOperationalSettingsUpdateInput(values: OperationalSettingsFormValues) {
  return {
    operationTimezone: values.operationTimezone.trim(),
    defaultRadiusMeters: Number(values.defaultRadiusMeters),
    defaultOperationStartTime: values.defaultOperationStartTime.trim() || null,
    defaultOperationEndTime: values.defaultOperationEndTime.trim() || null,
    defaultEarlyArrivalToleranceMinutes: Number(values.defaultEarlyArrivalToleranceMinutes),
    defaultLateArrivalToleranceMinutes: Number(values.defaultLateArrivalToleranceMinutes),
    lateGraceMinutes: Number(values.lateGraceMinutes),
    earlyLeaveToleranceMinutes: Number(values.earlyLeaveToleranceMinutes),
    pendingOperationExpirationHours: Number(values.pendingOperationExpirationHours),
    confirmationReminderEnabled: values.confirmationReminderEnabled,
    confirmationReminderHoursBefore: Number(values.confirmationReminderHoursBefore),
  };
}

export function operationalSettingsEqual(
  left: OperationalSettingsFormValues,
  right: OperationalSettingsFormValues,
): boolean {
  return (
    left.operationTimezone === right.operationTimezone &&
    left.defaultRadiusMeters === right.defaultRadiusMeters &&
    left.defaultOperationStartTime === right.defaultOperationStartTime &&
    left.defaultOperationEndTime === right.defaultOperationEndTime &&
    left.defaultEarlyArrivalToleranceMinutes === right.defaultEarlyArrivalToleranceMinutes &&
    left.defaultLateArrivalToleranceMinutes === right.defaultLateArrivalToleranceMinutes &&
    left.lateGraceMinutes === right.lateGraceMinutes &&
    left.earlyLeaveToleranceMinutes === right.earlyLeaveToleranceMinutes &&
    left.pendingOperationExpirationHours === right.pendingOperationExpirationHours &&
    left.confirmationReminderEnabled === right.confirmationReminderEnabled &&
    left.confirmationReminderHoursBefore === right.confirmationReminderHoursBefore
  );
}

export function validateCompanySettingsForm(values: CompanySettingsFormValues): string[] {
  return fieldErrorsToMessages(validateCompanySettingsFields(values));
}

export function toCompanySettingsFormValues(settings: {
  operationTimezone: string;
  defaultRadiusMeters: number;
  lateGraceMinutes: number;
  earlyLeaveToleranceMinutes: number;
  pendingOperationExpirationHours: number;
  requireCheckoutLocation: boolean;
  allowManualAttendanceCorrections: boolean;
  defaultEarlyArrivalToleranceMinutes: number;
  defaultLateArrivalToleranceMinutes: number;
  defaultOperationStartTime: string | null;
  defaultOperationEndTime: string | null;
  geofenceReviewMarginMeters?: number | null;
  confirmationReminderEnabled: boolean;
  confirmationReminderHoursBefore: number;
}): CompanySettingsFormValues {
  return {
    operationTimezone: settings.operationTimezone,
    defaultRadiusMeters: String(settings.defaultRadiusMeters),
    geofenceReviewMarginMeters:
      settings.geofenceReviewMarginMeters === null ||
      settings.geofenceReviewMarginMeters === undefined
        ? ""
        : String(settings.geofenceReviewMarginMeters),
    defaultOperationStartTime: settings.defaultOperationStartTime ?? "",
    defaultOperationEndTime: settings.defaultOperationEndTime ?? "",
    defaultEarlyArrivalToleranceMinutes: String(settings.defaultEarlyArrivalToleranceMinutes),
    defaultLateArrivalToleranceMinutes: String(settings.defaultLateArrivalToleranceMinutes),
    lateGraceMinutes: String(settings.lateGraceMinutes),
    earlyLeaveToleranceMinutes: String(settings.earlyLeaveToleranceMinutes),
    pendingOperationExpirationHours: String(settings.pendingOperationExpirationHours),
    requireCheckoutLocation: settings.requireCheckoutLocation,
    allowManualAttendanceCorrections: settings.allowManualAttendanceCorrections,
    confirmationReminderEnabled: settings.confirmationReminderEnabled,
    confirmationReminderHoursBefore: String(settings.confirmationReminderHoursBefore),
  };
}

export function toCompanySettingsUpdateInput(values: CompanySettingsFormValues) {
  return {
    operationTimezone: values.operationTimezone.trim(),
    defaultRadiusMeters: Number(values.defaultRadiusMeters),
    geofenceReviewMarginMeters: values.geofenceReviewMarginMeters.trim()
      ? Number(values.geofenceReviewMarginMeters)
      : null,
    defaultOperationStartTime: values.defaultOperationStartTime.trim() || null,
    defaultOperationEndTime: values.defaultOperationEndTime.trim() || null,
    defaultEarlyArrivalToleranceMinutes: Number(values.defaultEarlyArrivalToleranceMinutes),
    defaultLateArrivalToleranceMinutes: Number(values.defaultLateArrivalToleranceMinutes),
    lateGraceMinutes: Number(values.lateGraceMinutes),
    earlyLeaveToleranceMinutes: Number(values.earlyLeaveToleranceMinutes),
    pendingOperationExpirationHours: Number(values.pendingOperationExpirationHours),
    requireCheckoutLocation: values.requireCheckoutLocation,
    allowManualAttendanceCorrections: values.allowManualAttendanceCorrections,
    confirmationReminderEnabled: values.confirmationReminderEnabled,
    confirmationReminderHoursBefore: Number(values.confirmationReminderHoursBefore),
  };
}

export function formValuesEqual(
  left: CompanySettingsFormValues,
  right: CompanySettingsFormValues,
): boolean {
  return (
    left.operationTimezone === right.operationTimezone &&
    left.defaultRadiusMeters === right.defaultRadiusMeters &&
    left.geofenceReviewMarginMeters === right.geofenceReviewMarginMeters &&
    left.defaultOperationStartTime === right.defaultOperationStartTime &&
    left.defaultOperationEndTime === right.defaultOperationEndTime &&
    left.defaultEarlyArrivalToleranceMinutes === right.defaultEarlyArrivalToleranceMinutes &&
    left.defaultLateArrivalToleranceMinutes === right.defaultLateArrivalToleranceMinutes &&
    left.lateGraceMinutes === right.lateGraceMinutes &&
    left.earlyLeaveToleranceMinutes === right.earlyLeaveToleranceMinutes &&
    left.pendingOperationExpirationHours === right.pendingOperationExpirationHours &&
    left.requireCheckoutLocation === right.requireCheckoutLocation &&
    left.allowManualAttendanceCorrections === right.allowManualAttendanceCorrections
  );
}

export function generalSettingsEqual(
  left: Pick<CompanySettingsFormValues, "operationTimezone">,
  right: Pick<CompanySettingsFormValues, "operationTimezone">,
): boolean {
  return left.operationTimezone === right.operationTimezone;
}

export function operationSettingsEqual(
  left: Pick<
    CompanySettingsFormValues,
    | "defaultRadiusMeters"
    | "geofenceReviewMarginMeters"
    | "defaultOperationStartTime"
    | "defaultOperationEndTime"
    | "defaultEarlyArrivalToleranceMinutes"
    | "defaultLateArrivalToleranceMinutes"
  >,
  right: Pick<
    CompanySettingsFormValues,
    | "defaultRadiusMeters"
    | "geofenceReviewMarginMeters"
    | "defaultOperationStartTime"
    | "defaultOperationEndTime"
    | "defaultEarlyArrivalToleranceMinutes"
    | "defaultLateArrivalToleranceMinutes"
  >,
): boolean {
  return (
    left.defaultRadiusMeters === right.defaultRadiusMeters &&
    left.geofenceReviewMarginMeters === right.geofenceReviewMarginMeters &&
    left.defaultOperationStartTime === right.defaultOperationStartTime &&
    left.defaultOperationEndTime === right.defaultOperationEndTime &&
    left.defaultEarlyArrivalToleranceMinutes === right.defaultEarlyArrivalToleranceMinutes &&
    left.defaultLateArrivalToleranceMinutes === right.defaultLateArrivalToleranceMinutes
  );
}

export function whatsAppSettingsEqual(
  left: Pick<
    CompanySettingsFormValues,
    "lateGraceMinutes" | "earlyLeaveToleranceMinutes" | "pendingOperationExpirationHours"
  >,
  right: Pick<
    CompanySettingsFormValues,
    "lateGraceMinutes" | "earlyLeaveToleranceMinutes" | "pendingOperationExpirationHours"
  >,
): boolean {
  return (
    left.lateGraceMinutes === right.lateGraceMinutes &&
    left.earlyLeaveToleranceMinutes === right.earlyLeaveToleranceMinutes &&
    left.pendingOperationExpirationHours === right.pendingOperationExpirationHours
  );
}

export function checkoutSettingsEqual(
  left: Pick<CompanySettingsFormValues, "requireCheckoutLocation">,
  right: Pick<CompanySettingsFormValues, "requireCheckoutLocation">,
): boolean {
  return left.requireCheckoutLocation === right.requireCheckoutLocation;
}

export function correctionsSettingsEqual(
  left: Pick<CompanySettingsFormValues, "allowManualAttendanceCorrections">,
  right: Pick<CompanySettingsFormValues, "allowManualAttendanceCorrections">,
): boolean {
  return left.allowManualAttendanceCorrections === right.allowManualAttendanceCorrections;
}
