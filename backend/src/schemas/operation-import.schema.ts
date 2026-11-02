import { z } from "zod";
import { SCHEDULE_SOURCES } from "../constants/schedule-source";
import { weeklyScheduleDaySchema } from "./weekly-schedule.schema";

const operationImportShiftConfirmInputSchema = z.object({
  code: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(200),
  templateId: z.string().uuid().nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horario inválido (HH:mm)"),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horario inválido (HH:mm)"),
  days: z.array(
    z.object({
      dayOfWeek: z.number().int().min(1).max(7),
      isEnabled: z.boolean(),
    }),
  ),
});

export const operationImportPreviewSchema = z
  .object({
    fileName: z.string().trim().min(1, "El nombre del archivo es obligatorio"),
    fileContentBase64: z.string().min(1, "El archivo es obligatorio"),
  })
  .or(
    z.object({
      csv: z.string().min(1, "El archivo CSV es obligatorio"),
    }),
  );

export const operationImportOneTimeConfirmRowSchema = z.object({
  operationKind: z.literal("ONE_TIME").optional(),
  serviceId: z.string().uuid("UUID de servicio inválido"),
  scheduledStart: z.string().datetime({ offset: true }),
  scheduledEnd: z.string().datetime({ offset: true }),
  earlyToleranceMinutes: z.number().int().min(0),
  lateToleranceMinutes: z.number().int().min(0),
  earlyToleranceSource: z.enum(["COMPANY_DEFAULT", "CUSTOM"]).optional(),
  lateToleranceSource: z.enum(["COMPANY_DEFAULT", "CUSTOM"]).optional(),
});

export const operationImportRecurringConfirmRowSchema = z
  .object({
    operationKind: z.literal("RECURRING"),
    scheduleMode: z.enum(["SINGLE", "MULTI_SHIFT"]).optional(),
    multiShiftGroupKey: z.string().trim().min(1).optional(),
    serviceId: z.string().uuid("UUID de servicio inválido"),
    validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
    validUntil: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida")
      .nullable(),
    scheduleSource: z.enum(SCHEDULE_SOURCES),
    scheduleDays: z.array(weeklyScheduleDaySchema).length(7).optional(),
    shift: operationImportShiftConfirmInputSchema.optional(),
    earlyToleranceMinutes: z.number().int().min(0),
    lateToleranceMinutes: z.number().int().min(0),
    earlyToleranceSource: z.enum(["COMPANY_DEFAULT", "CUSTOM"]).optional(),
    lateToleranceSource: z.enum(["COMPANY_DEFAULT", "CUSTOM"]).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    const mode = data.scheduleMode ?? "SINGLE";
    if (mode === "MULTI_SHIFT") {
      if (!data.shift) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Falta información de turno para MULTI_SHIFT",
          path: ["shift"],
        });
      }
      if (data.scheduleSource !== "COMPANY") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "MULTI_SHIFT recurrente requiere origen_horario COMPANY",
          path: ["scheduleSource"],
        });
      }
      return;
    }

    if (data.shift) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "No enviés turnos cuando el modo es SINGLE",
        path: ["shift"],
      });
    }
  });

export const operationImportConfirmRowSchema = z.union([
  operationImportRecurringConfirmRowSchema,
  operationImportOneTimeConfirmRowSchema,
]);

export const operationImportConfirmSchema = z.object({
  rows: z.array(operationImportConfirmRowSchema).min(1, "Debe enviar al menos una fila"),
});

export type OperationImportPreviewInput = z.infer<typeof operationImportPreviewSchema>;
export type OperationImportConfirmInput = z.infer<typeof operationImportConfirmSchema>;
