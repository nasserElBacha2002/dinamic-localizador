import { z } from "zod";
import { IMPORT_ENTITY_TYPES } from "../imports/constants";

export const importEntityTypeParamSchema = z.object({
  entityType: z.enum(IMPORT_ENTITY_TYPES),
});

export const importFileBodySchema = z.object({
  fileName: z.string().trim().min(1, "El nombre del archivo es obligatorio").max(255),
  fileContentBase64: z.string().min(1, "El archivo es obligatorio"),
});

export type ImportFileBody = z.infer<typeof importFileBodySchema>;
