import { z } from "zod";
import { WHATSAPP_QUOTA_DEFAULTS, WHATSAPP_QUOTA_MODES } from "../constants/whatsapp-usage-quota";

const intField = (max: number, field: string) =>
  z
    .number()
    .int(`${field} debe ser un número entero.`)
    .min(0, `${field} no puede ser negativo.`)
    .max(max, `${field} supera el máximo permitido (${max}).`);

export const updateWhatsAppQuotaSettingsSchema = z
  .object({
    companyMode: z.enum(WHATSAPP_QUOTA_MODES),
    dailyTurns: intField(WHATSAPP_QUOTA_DEFAULTS.maxDailyTurns, "Turnos diarios"),
    weeklyTurns: intField(WHATSAPP_QUOTA_DEFAULTS.maxWeeklyTurns, "Turnos semanales"),
    burstTurns: intField(WHATSAPP_QUOTA_DEFAULTS.maxBurstTurns, "Turnos de ráfaga"),
    burstWindowSeconds: z
      .number()
      .int("La ventana de ráfaga debe ser un número entero.")
      .min(
        WHATSAPP_QUOTA_DEFAULTS.minBurstWindowSeconds,
        `La ventana de ráfaga mínima es ${WHATSAPP_QUOTA_DEFAULTS.minBurstWindowSeconds}s.`,
      )
      .max(
        WHATSAPP_QUOTA_DEFAULTS.maxBurstWindowSeconds,
        `La ventana de ráfaga máxima es ${WHATSAPP_QUOTA_DEFAULTS.maxBurstWindowSeconds}s.`,
      ),
    dailyOutbounds: intField(
      WHATSAPP_QUOTA_DEFAULTS.maxDailyOutbounds,
      "Respuestas salientes diarias",
    ),
    weeklyOutbounds: intField(
      WHATSAPP_QUOTA_DEFAULTS.maxWeeklyOutbounds,
      "Respuestas salientes semanales",
    ),
    companyDailyOutbounds: intField(
      WHATSAPP_QUOTA_DEFAULTS.maxCompanyDailyOutbounds,
      "Respuestas salientes diarias de la empresa",
    ),
    limitNoticeEnabled: z.boolean(),
    /** Optimistic concurrency — ISO timestamp from last GET. */
    expectedUpdatedAt: z.string().datetime().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.dailyTurns > value.weeklyTurns) {
      ctx.addIssue({
        code: "custom",
        path: ["dailyTurns"],
        message: "Los turnos diarios no pueden superar los semanales.",
      });
    }
    if (value.dailyOutbounds > value.weeklyOutbounds) {
      ctx.addIssue({
        code: "custom",
        path: ["dailyOutbounds"],
        message: "Las respuestas diarias no pueden superar las semanales.",
      });
    }
    if (value.burstTurns > value.dailyTurns) {
      ctx.addIssue({
        code: "custom",
        path: ["burstTurns"],
        message: "La ráfaga no puede superar el límite diario de turnos.",
      });
    }
    if (value.companyDailyOutbounds < value.dailyOutbounds) {
      ctx.addIssue({
        code: "custom",
        path: ["companyDailyOutbounds"],
        message:
          "El límite diario de la empresa no puede ser menor que el límite diario por empleado.",
      });
    }
  });

export type UpdateWhatsAppQuotaSettingsInput = z.infer<typeof updateWhatsAppQuotaSettingsSchema>;
