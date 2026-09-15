import { z } from "zod";

const hhMmSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horario inválido (HH:mm)");

const shiftVersionDaySchema = z.object({
  dayOfWeek: z.number().int().min(1).max(7),
  isEnabled: z.boolean(),
});

export const createShiftTemplateSchema = z.object({
  code: z.string().trim().min(1, "El código es obligatorio").max(80).optional(),
  name: z.string().trim().min(1, "El nombre es obligatorio").max(200),
  startTime: hhMmSchema,
  endTime: hhMmSchema,
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export const updateShiftTemplateSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    startTime: hhMmSchema.optional(),
    endTime: hhMmSchema.optional(),
    sortOrder: z.number().int().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Debe enviar al menos un campo para actualizar",
  });

export const shiftTemplateIdParamSchema = z.object({
  templateId: z.string().uuid("UUID de plantilla inválido"),
});

export const listShiftTemplatesQuerySchema = z.object({
  activeOnly: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => (value === undefined ? false : value === "true")),
});

export const operationShiftParamsSchema = z.object({
  operationId: z.string().uuid("UUID de operación inválido"),
});

export const operationShiftIdParamsSchema = z.object({
  operationId: z.string().uuid("UUID de operación inválido"),
  shiftId: z.string().uuid("UUID de turno inválido"),
});

export const createOperationShiftSchema = z.object({
  code: z.string().trim().min(1).max(80).optional(),
  name: z.string().trim().min(1, "El nombre es obligatorio").max(200),
  templateId: z.string().uuid().nullable().optional(),
  sortOrder: z.number().int().optional(),
  startTime: hhMmSchema,
  endTime: hhMmSchema,
  effectiveFrom: z.string().date("Fecha de vigencia inválida"),
  effectiveUntil: z.string().date("Fecha de fin inválida").nullable().optional(),
  days: z.array(shiftVersionDaySchema).optional(),
  isActive: z.boolean().optional(),
});

export const updateOperationShiftSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    sortOrder: z.number().int().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Debe enviar al menos un campo para actualizar",
  });

export const createOperationShiftVersionSchema = z.object({
  effectiveFrom: z.string().date("Fecha de vigencia inválida"),
  effectiveUntil: z.string().date("Fecha de fin inválida").nullable().optional(),
  startTime: hhMmSchema,
  endTime: hhMmSchema,
  days: z.array(shiftVersionDaySchema).optional(),
});

export const transitionToMultiShiftSchema = z.object({
  effectiveFrom: z.string().date("Fecha efectiva inválida"),
  shifts: z
    .array(
      z.object({
        code: z.string().trim().min(1).max(80),
        name: z.string().trim().min(1).max(200),
        templateId: z.string().uuid().nullable().optional(),
        sortOrder: z.number().int().optional(),
        startTime: hhMmSchema,
        endTime: hhMmSchema,
        effectiveUntil: z.string().date().nullable().optional(),
        days: z.array(shiftVersionDaySchema).optional(),
        assignmentIds: z.array(z.string().uuid()).optional(),
      }),
    )
    .min(1, "Se requiere al menos un turno"),
});

export const transitionToSingleSchema = z.object({
  effectiveFrom: z.string().date("Fecha efectiva inválida"),
});

export const upsertShiftExceptionSchema = z
  .object({
    workDate: z.string().date("Fecha inválida"),
    exceptionKind: z.enum(["CANCEL", "TIME_OVERRIDE", "RESTORE"]),
    startTime: hhMmSchema.nullable().optional(),
    endTime: hhMmSchema.nullable().optional(),
    reason: z.string().trim().max(500).nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.exceptionKind === "TIME_OVERRIDE") {
      if (!data.startTime || !data.endTime) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "TIME_OVERRIDE requiere startTime y endTime",
          path: ["startTime"],
        });
      }
    }
  });

export const listOperationShiftsQuerySchema = z.object({
  activeOnly: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => (value === undefined ? false : value === "true")),
});
