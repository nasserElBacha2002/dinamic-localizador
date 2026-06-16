import { z } from "zod";

const inventoryStatusSchema = z.enum(["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]);

export const inventoryFormSchema = z
  .object({
    storeId: z.string().uuid("Seleccioná una tienda"),
    scheduledStart: z.string().min(1, "La fecha de inicio es obligatoria"),
    scheduledEnd: z.string().optional().or(z.literal("")),
    earlyToleranceMinutes: z.number().int().min(0, "No puede ser negativa"),
    lateToleranceMinutes: z.number().int().min(0, "No puede ser negativa"),
    notes: z.string().optional().or(z.literal("")),
    status: inventoryStatusSchema.optional(),
  })
  .refine(
    (values) => {
      if (!values.scheduledEnd) {
        return true;
      }

      return values.scheduledEnd > values.scheduledStart;
    },
    {
      message: "La fecha de fin debe ser posterior al inicio",
      path: ["scheduledEnd"],
    },
  );

export type InventoryFormValues = z.infer<typeof inventoryFormSchema>;
