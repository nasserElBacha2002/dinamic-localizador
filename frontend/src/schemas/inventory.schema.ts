import { z } from "zod";
import { datetimeLocalToIso } from "../utils/dates";

const inventoryStatusSchema = z.enum(["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]);

const inventoryFormBaseSchema = z.object({
  storeId: z.string().uuid("Seleccioná una tienda"),
  scheduledStart: z.string().min(1, "La fecha de inicio es obligatoria"),
  scheduledEnd: z.string().optional().or(z.literal("")),
  earlyToleranceMinutes: z.number().int().min(0, "No puede ser negativa"),
  lateToleranceMinutes: z.number().int().min(0, "No puede ser negativa"),
  notes: z.string().optional().or(z.literal("")),
  status: inventoryStatusSchema.optional(),
});

const inventoryDateRangeRefinement = {
  check: (values: z.infer<typeof inventoryFormBaseSchema>) => {
    if (!values.scheduledEnd) {
      return true;
    }

    return values.scheduledEnd > values.scheduledStart;
  },
  message: "La fecha de fin debe ser posterior al inicio",
  path: ["scheduledEnd"] as const,
};

const inventoryFutureStartRefinement = {
  check: (values: z.infer<typeof inventoryFormBaseSchema>) =>
    new Date(datetimeLocalToIso(values.scheduledStart)) >= new Date(),
  message: "La fecha de inicio no puede estar en el pasado",
  path: ["scheduledStart"] as const,
};

export const inventoryFormSchema = inventoryFormBaseSchema.refine(
  inventoryDateRangeRefinement.check,
  {
    message: inventoryDateRangeRefinement.message,
    path: [...inventoryDateRangeRefinement.path],
  },
);

export const createInventoryFormSchema = inventoryFormBaseSchema
  .refine(inventoryDateRangeRefinement.check, {
    message: inventoryDateRangeRefinement.message,
    path: [...inventoryDateRangeRefinement.path],
  })
  .refine(inventoryFutureStartRefinement.check, {
    message: inventoryFutureStartRefinement.message,
    path: [...inventoryFutureStartRefinement.path],
  });

export type InventoryFormValues = z.infer<typeof inventoryFormSchema>;
