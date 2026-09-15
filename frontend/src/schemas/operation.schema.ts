import { z } from "zod";
import { WEEKDAYS } from "../types/schedule";
import { datetimeLocalToIso } from "../utils/dates";

const operationStatusSchema = z.enum(["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]);
const operationKindSchema = z.enum(["ONE_TIME", "RECURRING"]);
const scheduleSourceSchema = z.enum(["COMPANY", "CUSTOM"]);
const toleranceSourceSchema = z.enum(["COMPANY_DEFAULT", "CUSTOM"]);
const scheduleModeSchema = z.enum(["SINGLE", "MULTI_SHIFT"]);

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;

const weeklyScheduleDayFormSchema = z.object({
  dayOfWeek: z.enum(WEEKDAYS),
  isEnabled: z.boolean(),
  startTime: z.string().nullable(),
  endTime: z.string().nullable(),
});

const operationShiftSeedFormSchema = z.object({
  code: z.string(),
  name: z.string(),
  templateId: z.string().uuid().nullable().optional(),
  startTime: z.string(),
  endTime: z.string(),
  /** ISO weekday 1=Mon … 7=Sun; only used for RECURRING MULTI. */
  enabledDays: z.array(z.number().int().min(1).max(7)).optional(),
});

const operationSharedFields = {
  serviceId: z.string().uuid("Seleccioná un servicio"),
  earlyToleranceMinutes: z.number().int().min(0, "No puede ser negativa"),
  lateToleranceMinutes: z.number().int().min(0, "No puede ser negativa"),
  earlyToleranceSource: toleranceSourceSchema,
  lateToleranceSource: toleranceSourceSchema,
  status: operationStatusSchema.optional(),
  scheduleMode: scheduleModeSchema,
  shifts: z.array(operationShiftSeedFormSchema),
};

export const operationFormSchema = z
  .object({
    operationKind: operationKindSchema,
    ...operationSharedFields,
    scheduledStart: z.string(),
    scheduledEnd: z.string().optional().or(z.literal("")),
    validFrom: z.string(),
    validUntil: z.string().optional().or(z.literal("")),
    scheduleSource: scheduleSourceSchema,
    scheduleDays: z.array(weeklyScheduleDayFormSchema),
  })
  .superRefine((values, ctx) => {
    if (values.scheduleMode === "MULTI_SHIFT") {
      if (!values.shifts || values.shifts.length < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Agregá al menos un turno",
          path: ["shifts"],
        });
      }

      const codes = new Set<string>();
      values.shifts.forEach((shift, index) => {
        const code = shift.code.trim();
        const name = shift.name.trim();
        if (!name) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "El nombre del turno es obligatorio",
            path: ["shifts", index, "name"],
          });
        }
        if (!code) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "El código del turno es obligatorio",
            path: ["shifts", index, "code"],
          });
        } else {
          const normalized = code.toUpperCase();
          if (codes.has(normalized)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "Hay códigos de turno duplicados",
              path: ["shifts", index, "code"],
            });
          }
          codes.add(normalized);
        }
        if (!timePattern.test(shift.startTime) || !timePattern.test(shift.endTime)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Revisá los horarios del turno",
            path: ["shifts", index, "startTime"],
          });
        } else if (shift.startTime === shift.endTime) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Inicio y fin no pueden ser iguales",
            path: ["shifts", index, "endTime"],
          });
        }
        if (
          values.operationKind === "RECURRING" &&
          (!shift.enabledDays || shift.enabledDays.length === 0)
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Seleccioná al menos un día para el turno",
            path: ["shifts", index, "enabledDays"],
          });
        }
      });
    }

    if (values.operationKind === "ONE_TIME") {
      if (!values.scheduledStart) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "La fecha de inicio es obligatoria",
          path: ["scheduledStart"],
        });
      }

      if (values.scheduledEnd && values.scheduledStart && values.scheduledEnd <= values.scheduledStart) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "La fecha de fin debe ser posterior al inicio",
          path: ["scheduledEnd"],
        });
      }
      return;
    }

    if (!values.validFrom || !dateOnlyPattern.test(values.validFrom)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La fecha de inicio es obligatoria",
        path: ["validFrom"],
      });
    }

    if (values.validUntil && values.validFrom && values.validUntil < values.validFrom) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La fecha de finalización no puede ser anterior a la fecha de inicio",
        path: ["validUntil"],
      });
    }

    if (values.scheduleSource === "CUSTOM") {
      const enabledDays = values.scheduleDays.filter((day) => day.isEnabled);
      if (enabledDays.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Configurá al menos un día de trabajo para esta operación",
          path: ["scheduleDays"],
        });
      }

      for (const day of enabledDays) {
        if (!day.startTime || !timePattern.test(day.startTime)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Revisá los horarios configurados para los días laborables",
            path: ["scheduleDays"],
          });
          break;
        }
        if (!day.endTime || !timePattern.test(day.endTime)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Revisá los horarios configurados para los días laborables",
            path: ["scheduleDays"],
          });
          break;
        }
        if (day.startTime === day.endTime) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Revisá los horarios configurados para los días laborables",
            path: ["scheduleDays"],
          });
          break;
        }
      }
    }
  });

export const createOperationFormSchema = operationFormSchema.superRefine((values, ctx) => {
  if (values.operationKind !== "ONE_TIME" || !values.scheduledStart) {
    return;
  }

  if (new Date(datetimeLocalToIso(values.scheduledStart)) < new Date()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "La fecha de inicio no puede estar en el pasado",
      path: ["scheduledStart"],
    });
  }
});

export type OperationFormValues = z.infer<typeof operationFormSchema>;
export type OperationShiftSeedFormValues = z.infer<typeof operationShiftSeedFormSchema>;
