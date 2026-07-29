import { z } from "zod";
import { COMPANY_ROLES } from "../types/company";
import { USER_INVITATION_STATUSES } from "../types/user-invitation";
import { passwordSchema } from "../utils/password-policy";
import { paginationQuerySchema } from "./common.schema";

export const createInvitationSchema = z
  .object({
    name: z.string().trim().min(1, "El nombre es obligatorio").max(150).optional(),
    email: z.string().trim().email("Email inválido").max(255),
    role: z.enum(COMPANY_ROLES, { message: "Rol de empresa inválido" }),
  })
  .strict();

export const invitationIdParamSchema = z.object({
  invitationId: z.string().uuid("UUID de invitación inválido"),
});

export const listInvitationsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(USER_INVITATION_STATUSES).optional(),
});

export const previewInvitationQuerySchema = z.object({
  token: z.string().trim().min(20, "Token inválido").max(200),
});

export const acceptInvitationSchema = z
  .object({
    token: z.string().trim().min(20, "Token inválido").max(200),
    name: z.string().trim().min(1).max(150).optional(),
    password: passwordSchema.optional(),
    passwordConfirmation: z.string().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.password !== undefined && value.passwordConfirmation === undefined) {
      ctx.addIssue({
        code: "custom",
        message: "Confirmá la contraseña",
        path: ["passwordConfirmation"],
      });
    }
    if (
      value.password !== undefined &&
      value.passwordConfirmation !== undefined &&
      value.password !== value.passwordConfirmation
    ) {
      ctx.addIssue({
        code: "custom",
        message: "La confirmación de contraseña no coincide",
        path: ["passwordConfirmation"],
      });
    }
  });

export const declineInvitationSchema = z
  .object({
    token: z.string().trim().min(20, "Token inválido").max(200),
  })
  .strict();

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
export type DeclineInvitationInput = z.infer<typeof declineInvitationSchema>;
