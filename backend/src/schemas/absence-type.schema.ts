import { z } from "zod";
import { ABSENCE_DAY_COUNTING_MODES } from "../constants/absence-calendar";

export const listAbsenceTypesQuerySchema = z.object({
  activeOnly: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value !== "false"),
});

export const absenceTypeIdParamSchema = z.object({
  id: z.string().uuid("UUID de tipo inválido"),
});

export const updateAbsenceTypeSchema = z.object({
  dayCountingMode: z.enum(ABSENCE_DAY_COUNTING_MODES).optional(),
  calendarId: z.string().uuid("UUID de calendario inválido").nullable().optional(),
  expectedVersion: z.coerce.number().int().min(1).optional(),
});

export type ListAbsenceTypesQuery = z.infer<typeof listAbsenceTypesQuerySchema>;
export type UpdateAbsenceTypeInput = z.infer<typeof updateAbsenceTypeSchema>;
