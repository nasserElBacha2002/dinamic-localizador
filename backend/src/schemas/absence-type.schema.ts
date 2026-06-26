import { z } from "zod";

export const listAbsenceTypesQuerySchema = z.object({
  activeOnly: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value !== "false"),
});

export type ListAbsenceTypesQuery = z.infer<typeof listAbsenceTypesQuerySchema>;
