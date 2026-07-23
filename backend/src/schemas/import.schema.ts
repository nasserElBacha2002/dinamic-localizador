import { z } from "zod";
import {
  DEFAULT_IMPORT_MAX_BASE64_CHARS,
  IMPORT_ENTITY_TYPES,
} from "../imports/constants";

export const importEntityTypeParamSchema = z.object({
  entityType: z.enum(IMPORT_ENTITY_TYPES),
});

export const importFileBodySchema = z.object({
  fileName: z.string().trim().min(1, "El nombre del archivo es obligatorio").max(255),
  fileContentBase64: z
    .string()
    .min(1, "El archivo es obligatorio")
    .max(DEFAULT_IMPORT_MAX_BASE64_CHARS, "El archivo supera el tamaño máximo permitido"),
  idempotencyKey: z.string().trim().min(1).max(128).optional().nullable(),
});

export const importExecuteBodySchema = z
  .object({
    fileName: z.string().trim().min(1).max(255).optional(),
    fileContentBase64: z
      .string()
      .min(1)
      .max(DEFAULT_IMPORT_MAX_BASE64_CHARS)
      .optional(),
    importJobId: z.string().uuid().optional(),
    confirmationToken: z.string().uuid().optional(),
    idempotencyKey: z.string().trim().min(1).max(128).optional().nullable(),
    forceNew: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    const hasJob = Boolean(value.importJobId && value.confirmationToken);
    const hasFile = Boolean(value.fileName && value.fileContentBase64);
    if (!hasJob && !hasFile) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Debés enviar importJobId+confirmationToken o el archivo a importar.",
      });
    }
  });

export type ImportFileBody = z.infer<typeof importFileBodySchema>;
export type ImportExecuteBody = z.infer<typeof importExecuteBodySchema>;
