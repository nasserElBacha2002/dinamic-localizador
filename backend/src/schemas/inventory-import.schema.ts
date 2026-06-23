import { z } from "zod";

export const inventoryImportPreviewSchema = z
  .object({
    fileName: z.string().trim().min(1, "El nombre del archivo es obligatorio"),
    fileContentBase64: z.string().min(1, "El archivo es obligatorio"),
  })
  .or(
    z.object({
      csv: z.string().min(1, "El archivo CSV es obligatorio"),
    }),
  );

export const inventoryImportConfirmRowSchema = z.object({
  storeId: z.string().uuid("UUID de tienda inválido"),
  scheduledStart: z.string().datetime({ offset: true }),
  scheduledEnd: z.string().datetime({ offset: true }),
  earlyToleranceMinutes: z.number().int().min(0),
  lateToleranceMinutes: z.number().int().min(0),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const inventoryImportConfirmSchema = z.object({
  rows: z.array(inventoryImportConfirmRowSchema).min(1, "Debe enviar al menos una fila"),
});

export type InventoryImportPreviewInput = z.infer<typeof inventoryImportPreviewSchema>;
export type InventoryImportConfirmInput = z.infer<typeof inventoryImportConfirmSchema>;
