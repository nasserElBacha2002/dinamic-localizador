import type { CompanySettingsFormValues } from "../types/company-settings";

const LIMITS = {
  defaultRadiusMeters: { min: 10, max: 5000 },
  lateGraceMinutes: { min: 0, max: 240 },
  earlyLeaveToleranceMinutes: { min: 0, max: 240 },
  inventoryToleranceMinutes: { min: 0, max: 240 },
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

export function validateCompanySettingsForm(values: CompanySettingsFormValues): string[] {
  const errors: string[] = [];
  const timezone = values.operationTimezone.trim();

  if (!timezone) {
    errors.push("La zona horaria operativa es obligatoria.");
  } else if (timezone.length > LIMITS.operationTimezoneMaxLength) {
    errors.push("La zona horaria operativa no puede superar 80 caracteres.");
  } else if (!isValidTimezone(timezone)) {
    errors.push("La zona horaria operativa no es válida.");
  }

  const radiusError = validateIntegerField(
    values.defaultRadiusMeters,
    "El radio predeterminado",
    LIMITS.defaultRadiusMeters.min,
    LIMITS.defaultRadiusMeters.max,
  );
  if (radiusError) {
    errors.push(radiusError);
  }

  const startTimeError = validateOptionalHHmm(
    values.defaultOperationStartTime,
    "El horario de inicio por defecto",
  );
  if (startTimeError) {
    errors.push(startTimeError);
  }

  const endTimeError = validateOptionalHHmm(
    values.defaultOperationEndTime,
    "El horario de fin por defecto",
  );
  if (endTimeError) {
    errors.push(endTimeError);
  }

  const earlyArrivalError = validateIntegerField(
    values.defaultEarlyArrivalToleranceMinutes,
    "La tolerancia de llegada temprana para operaciones",
    LIMITS.inventoryToleranceMinutes.min,
    LIMITS.inventoryToleranceMinutes.max,
  );
  if (earlyArrivalError) {
    errors.push(earlyArrivalError);
  }

  const lateArrivalError = validateIntegerField(
    values.defaultLateArrivalToleranceMinutes,
    "La tolerancia de llegada tardía para operaciones",
    LIMITS.inventoryToleranceMinutes.min,
    LIMITS.inventoryToleranceMinutes.max,
  );
  if (lateArrivalError) {
    errors.push(lateArrivalError);
  }

  const lateGraceError = validateIntegerField(
    values.lateGraceMinutes,
    "La tolerancia de puntualidad WhatsApp",
    LIMITS.lateGraceMinutes.min,
    LIMITS.lateGraceMinutes.max,
  );
  if (lateGraceError) {
    errors.push(lateGraceError);
  }

  const earlyLeaveError = validateIntegerField(
    values.earlyLeaveToleranceMinutes,
    "La tolerancia de salida anticipada WhatsApp",
    LIMITS.earlyLeaveToleranceMinutes.min,
    LIMITS.earlyLeaveToleranceMinutes.max,
  );
  if (earlyLeaveError) {
    errors.push(earlyLeaveError);
  }

  return errors;
}

export function toCompanySettingsFormValues(settings: {
  operationTimezone: string;
  defaultRadiusMeters: number;
  lateGraceMinutes: number;
  earlyLeaveToleranceMinutes: number;
  requireCheckoutLocation: boolean;
  allowManualAttendanceCorrections: boolean;
  defaultEarlyArrivalToleranceMinutes: number;
  defaultLateArrivalToleranceMinutes: number;
  defaultOperationStartTime: string | null;
  defaultOperationEndTime: string | null;
}): CompanySettingsFormValues {
  return {
    operationTimezone: settings.operationTimezone,
    defaultRadiusMeters: String(settings.defaultRadiusMeters),
    defaultOperationStartTime: settings.defaultOperationStartTime ?? "",
    defaultOperationEndTime: settings.defaultOperationEndTime ?? "",
    defaultEarlyArrivalToleranceMinutes: String(settings.defaultEarlyArrivalToleranceMinutes),
    defaultLateArrivalToleranceMinutes: String(settings.defaultLateArrivalToleranceMinutes),
    lateGraceMinutes: String(settings.lateGraceMinutes),
    earlyLeaveToleranceMinutes: String(settings.earlyLeaveToleranceMinutes),
    requireCheckoutLocation: settings.requireCheckoutLocation,
    allowManualAttendanceCorrections: settings.allowManualAttendanceCorrections,
  };
}

export function toCompanySettingsUpdateInput(values: CompanySettingsFormValues) {
  return {
    operationTimezone: values.operationTimezone.trim(),
    defaultRadiusMeters: Number(values.defaultRadiusMeters),
    defaultOperationStartTime: values.defaultOperationStartTime.trim() || null,
    defaultOperationEndTime: values.defaultOperationEndTime.trim() || null,
    defaultEarlyArrivalToleranceMinutes: Number(values.defaultEarlyArrivalToleranceMinutes),
    defaultLateArrivalToleranceMinutes: Number(values.defaultLateArrivalToleranceMinutes),
    lateGraceMinutes: Number(values.lateGraceMinutes),
    earlyLeaveToleranceMinutes: Number(values.earlyLeaveToleranceMinutes),
    requireCheckoutLocation: values.requireCheckoutLocation,
    allowManualAttendanceCorrections: values.allowManualAttendanceCorrections,
  };
}

export function formValuesEqual(
  left: CompanySettingsFormValues,
  right: CompanySettingsFormValues,
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
    left.requireCheckoutLocation === right.requireCheckoutLocation &&
    left.allowManualAttendanceCorrections === right.allowManualAttendanceCorrections
  );
}
