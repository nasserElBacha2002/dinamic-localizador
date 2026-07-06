import { z } from "zod";
import { datetimeLocalToIso } from "../utils/dates";

const operationStatusSchema = z.enum(["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]);

const operationFormBaseSchema = z.object({
  serviceId: z.string().uuid("Seleccioná un servicio"),
  scheduledStart: z.string().min(1, "La fecha de inicio es obligatoria"),
  scheduledEnd: z.string().optional().or(z.literal("")),
  earlyToleranceMinutes: z.number().int().min(0, "No puede ser negativa"),
  lateToleranceMinutes: z.number().int().min(0, "No puede ser negativa"),
  notes: z.string().optional().or(z.literal("")),
  status: operationStatusSchema.optional(),
});

const operationDateRangeRefinement = {
  check: (values: z.infer<typeof operationFormBaseSchema>) => {
    if (!values.scheduledEnd) {
      return true;
    }

    return values.scheduledEnd > values.scheduledStart;
  },
  message: "La fecha de fin debe ser posterior al inicio",
  path: ["scheduledEnd"] as const,
};

const operationFutureStartRefinement = {
  check: (values: z.infer<typeof operationFormBaseSchema>) =>
    new Date(datetimeLocalToIso(values.scheduledStart)) >= new Date(),
  message: "La fecha de inicio no puede estar en el pasado",
  path: ["scheduledStart"] as const,
};

export const operationFormSchema = operationFormBaseSchema.refine(
  operationDateRangeRefinement.check,
  {
    message: operationDateRangeRefinement.message,
    path: [...operationDateRangeRefinement.path],
  },
);

export const createOperationFormSchema = operationFormBaseSchema
  .refine(operationDateRangeRefinement.check, {
    message: operationDateRangeRefinement.message,
    path: [...operationDateRangeRefinement.path],
  })
  .refine(operationFutureStartRefinement.check, {
    message: operationFutureStartRefinement.message,
    path: [...operationFutureStartRefinement.path],
  });

export type OperationFormValues = z.infer<typeof operationFormSchema>;
