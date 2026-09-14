import type {
  WhatsAppQuotaFormValues,
  WhatsAppQuotaSettings,
} from "../types/whatsapp-quota-settings";

export const toWhatsAppQuotaFormValues = (
  settings: WhatsAppQuotaSettings,
): WhatsAppQuotaFormValues => ({
  companyMode: settings.companyMode,
  dailyTurns: settings.dailyTurns,
  weeklyTurns: settings.weeklyTurns,
  burstTurns: settings.burstTurns,
  burstWindowSeconds: settings.burstWindowSeconds,
  dailyOutbounds: settings.dailyOutbounds,
  weeklyOutbounds: settings.weeklyOutbounds,
  companyDailyOutbounds: settings.companyDailyOutbounds,
  limitNoticeEnabled: settings.limitNoticeEnabled,
});

export const whatsappQuotaFormEqual = (
  a: WhatsAppQuotaFormValues,
  b: WhatsAppQuotaFormValues,
): boolean =>
  a.companyMode === b.companyMode &&
  a.dailyTurns === b.dailyTurns &&
  a.weeklyTurns === b.weeklyTurns &&
  a.burstTurns === b.burstTurns &&
  a.burstWindowSeconds === b.burstWindowSeconds &&
  a.dailyOutbounds === b.dailyOutbounds &&
  a.weeklyOutbounds === b.weeklyOutbounds &&
  a.companyDailyOutbounds === b.companyDailyOutbounds &&
  a.limitNoticeEnabled === b.limitNoticeEnabled;

export const validateWhatsAppQuotaForm = (
  values: WhatsAppQuotaFormValues,
  limits: WhatsAppQuotaSettings["limits"],
): string[] => {
  const errors: string[] = [];
  const intFields: Array<[keyof WhatsAppQuotaFormValues, number, number, string]> = [
    ["dailyTurns", 0, limits.maxDailyTurns, "Turnos diarios"],
    ["weeklyTurns", 0, limits.maxWeeklyTurns, "Turnos semanales"],
    ["burstTurns", 0, limits.maxBurstTurns, "Turnos de ráfaga"],
    [
      "burstWindowSeconds",
      limits.minBurstWindowSeconds,
      limits.maxBurstWindowSeconds,
      "Ventana de ráfaga",
    ],
    ["dailyOutbounds", 0, limits.maxDailyOutbounds, "Respuestas diarias"],
    ["weeklyOutbounds", 0, limits.maxWeeklyOutbounds, "Respuestas semanales"],
    [
      "companyDailyOutbounds",
      0,
      limits.maxCompanyDailyOutbounds,
      "Respuestas diarias de la empresa",
    ],
  ];

  for (const [key, min, max, label] of intFields) {
    const value = values[key];
    if (typeof value !== "number" || !Number.isInteger(value) || !Number.isFinite(value)) {
      errors.push(`${label}: debe ser un número entero.`);
      continue;
    }
    if (value < min || value > max) {
      errors.push(`${label}: debe estar entre ${min} y ${max}.`);
    }
  }

  if (values.dailyTurns > values.weeklyTurns) {
    errors.push("Los turnos diarios no pueden superar los semanales.");
  }
  if (values.dailyOutbounds > values.weeklyOutbounds) {
    errors.push("Las respuestas diarias no pueden superar las semanales.");
  }
  if (values.burstTurns > values.dailyTurns) {
    errors.push("La ráfaga no puede superar el límite diario de turnos.");
  }
  if (values.companyDailyOutbounds < values.dailyOutbounds) {
    errors.push(
      "El límite diario de la empresa no puede ser menor que el límite diario por empleado.",
    );
  }

  return errors;
};

export const effectiveModeReasonLabel = (reason: string): string => {
  switch (reason) {
    case "GLOBAL_MODE_OFF":
      return "El modo global del servidor está en OFF.";
    case "COMPANY_MODE_OFF":
      return "El modo de la empresa está en OFF.";
    case "BOTH_ENFORCE":
      return "Global y empresa están en ENFORCE.";
    case "SHADOW_COMBINATION":
      return "La combinación actual resulta en SHADOW (medición sin bloqueo).";
    default:
      return reason;
  }
};

export const modeDescription = (mode: string): string => {
  switch (mode) {
    case "OFF":
      return "Las cuotas están desactivadas. Los mensajes no se bloquean ni se contabilizan en el sistema operativo de cuotas.";
    case "SHADOW":
      return "El sistema calcula qué mensajes serían admitidos o rechazados, pero no bloquea al empleado. Se utiliza para medir el impacto antes de activar ENFORCE.";
    case "ENFORCE":
      return "El sistema aplica los límites y puede rechazar funciones no críticas. Las funciones críticas de asistencia deben continuar siempre disponibles.";
    default:
      return "";
  }
};
