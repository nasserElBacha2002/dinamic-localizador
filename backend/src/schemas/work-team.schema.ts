import { z } from "zod";
import {
  activeFilterSchema,
  paginationQuerySchema,
  searchFilterSchema,
  tableSortSchema,
  uuidSchema,
} from "./common.schema";

export const createWorkTeamSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(200),
  description: z.string().trim().max(500).nullable().optional(),
  employeeIds: z.array(uuidSchema).optional(),
});

export const updateWorkTeamSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Debe enviar al menos un campo para actualizar",
  });

export const workTeamIdParamSchema = z.object({
  workTeamId: uuidSchema,
});

export const workTeamMemberParamsSchema = z.object({
  workTeamId: uuidSchema,
  employeeId: uuidSchema,
});

export const listWorkTeamsQuerySchema = paginationQuerySchema
  .merge(activeFilterSchema)
  .merge(searchFilterSchema)
  .merge(tableSortSchema)
  .extend({
    sortBy: z.enum(["name", "updatedAt", "memberCount", "activeMemberCount"]).optional(),
  });

export const replaceWorkTeamMembersSchema = z.object({
  employeeIds: z.array(uuidSchema),
});

export const addWorkTeamMembersSchema = z.object({
  employeeIds: z.array(uuidSchema).min(1, "Debe seleccionar al menos un colaborador"),
});

export const workTeamAssignPreviewSchema = z.object({
  workTeamIds: z.array(uuidSchema).min(1, "Debe seleccionar al menos un grupo"),
  validFrom: z.string().date().optional(),
  validUntil: z.string().date().nullable().optional(),
});

export const workTeamAssignConfirmSchema = z.object({
  previewToken: uuidSchema,
});

export const batchIdParamSchema = z.object({
  batchId: uuidSchema,
});

export const listWorkTeamUsageQuerySchema = paginationQuerySchema;

export type CreateWorkTeamInput = z.infer<typeof createWorkTeamSchema>;
export type UpdateWorkTeamInput = z.infer<typeof updateWorkTeamSchema>;
export type ListWorkTeamsQuery = z.infer<typeof listWorkTeamsQuerySchema>;
export type ReplaceWorkTeamMembersInput = z.infer<typeof replaceWorkTeamMembersSchema>;
export type AddWorkTeamMembersInput = z.infer<typeof addWorkTeamMembersSchema>;
export type WorkTeamAssignPreviewInput = z.infer<typeof workTeamAssignPreviewSchema>;
export type WorkTeamAssignConfirmInput = z.infer<typeof workTeamAssignConfirmSchema>;
export type ListWorkTeamUsageQuery = z.infer<typeof listWorkTeamUsageQuerySchema>;
