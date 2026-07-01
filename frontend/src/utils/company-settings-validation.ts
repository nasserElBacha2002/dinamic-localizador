import type { CompanySettingsFormValues } from "../types/company-settings";

const LIMITS = {
  defaultRadiusMeters: { min: 10, max: 5000 },
  lateGraceMinutes: { min: 0, max: 240 },
  earlyLeaveToleranceMinutes: { min: 0, max: 240 },
  operationTimezoneMaxLength: 80,
} as const;

function isValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
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

  const radiusRaw = values.defaultRadiusMeters.trim();
  const radius = Number(radiusRaw);
  if (
    !radiusRaw ||
    !Number.isInteger(radius) ||
    radius < LIMITS.defaultRadiusMeters.min ||
    radius > LIMITS.defaultRadiusMeters.max
  ) {
    errors.push("El radio predeterminado debe ser un número entero entre 10 y 5000.");
  }

  const lateGraceRaw = values.lateGraceMinutes.trim();
  const lateGrace = Number(lateGraceRaw);
  if (
    !lateGraceRaw ||
    !Number.isInteger(lateGrace) ||
    lateGrace < LIMITS.lateGraceMinutes.min ||
    lateGrace > LIMITS.lateGraceMinutes.max
  ) {
    errors.push("La tolerancia de llegada debe ser un número entero entre 0 y 240.");
  }

  const earlyLeaveRaw = values.earlyLeaveToleranceMinutes.trim();
  const earlyLeave = Number(earlyLeaveRaw);
  if (
    !earlyLeaveRaw ||
    !Number.isInteger(earlyLeave) ||
    earlyLeave < LIMITS.earlyLeaveToleranceMinutes.min ||
    earlyLeave > LIMITS.earlyLeaveToleranceMinutes.max
  ) {
    errors.push("La tolerancia de salida anticipada debe ser un número entero entre 0 y 240.");
  }

  return errors;
}

export function toCompanySettingsFormValues(
  settings: {
    operationTimezone: string;
    defaultRadiusMeters: number;
    lateGraceMinutes: number;
    earlyLeaveToleranceMinutes: number;
    requireCheckoutLocation: boolean;
    allowManualAttendanceCorrections: boolean;
  },
): CompanySettingsFormValues {
  return {
    operationTimezone: settings.operationTimezone,
    defaultRadiusMeters: String(settings.defaultRadiusMeters),
    lateGraceMinutes: String(settings.lateGraceMinutes),
    earlyLeaveToleranceMinutes: String(settings.earlyLeaveToleranceMinutes),
    requireCheckoutLocation: settings.requireCheckoutLocation,
    allowManualAttendanceCorrections: settings.allowManualAttendanceCorrections,
  };
}

export function formValuesEqual(
  left: CompanySettingsFormValues,
  right: CompanySettingsFormValues,
): boolean {
  return (
    left.operationTimezone === right.operationTimezone &&
    left.defaultRadiusMeters === right.defaultRadiusMeters &&
    left.lateGraceMinutes === right.lateGraceMinutes &&
    left.earlyLeaveToleranceMinutes === right.earlyLeaveToleranceMinutes &&
    left.requireCheckoutLocation === right.requireCheckoutLocation &&
    left.allowManualAttendanceCorrections === right.allowManualAttendanceCorrections
  );
}
