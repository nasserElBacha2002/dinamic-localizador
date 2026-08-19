import { z } from "zod";
import { passwordSchema } from "../utils/password-policy";

export const loginSchema = z.object({
  email: z.string().trim().email("Email inválido"),
  password: z.string().min(1, "La contraseña es obligatoria"),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email("Email inválido"),
});

export const resetPasswordSchema = z
  .object({
    token: z.string().trim().min(1, "El token es obligatorio"),
    password: passwordSchema,
    passwordConfirmation: z.string().min(1, "Confirmá la contraseña"),
  })
  .refine((values) => values.password === values.passwordConfirmation, {
    message: "Las contraseñas no coinciden.",
    path: ["passwordConfirmation"],
  });

const totpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "El código debe tener 6 dígitos");

export const loginTwoFactorSchema = z
  .object({
    challengeToken: z.string().trim().min(1, "El desafío es obligatorio"),
    code: totpCodeSchema.optional(),
    recoveryCode: z.string().trim().min(8).max(64).optional(),
  })
  .refine((values) => Boolean(values.code) !== Boolean(values.recoveryCode), {
    message: "Indicá un código TOTP o un código de recuperación, no ambos.",
    path: ["code"],
  });

export const twoFactorConfirmSchema = z.object({
  password: z.string().min(1, "La contraseña es obligatoria"),
  code: totpCodeSchema,
});

export const twoFactorRegenerateSchema = twoFactorConfirmSchema;

export const twoFactorDisableSchema = z
  .object({
    password: z.string().min(1, "La contraseña es obligatoria"),
    code: totpCodeSchema.optional(),
    recoveryCode: z.string().trim().min(8).max(64).optional(),
  })
  .refine((values) => Boolean(values.code) !== Boolean(values.recoveryCode), {
    message: "Indicá un código TOTP o un código de recuperación, no ambos.",
    path: ["code"],
  });

export const twoFactorReconfigureSetupSchema = z
  .object({
    password: z.string().min(1, "La contraseña es obligatoria"),
    code: totpCodeSchema.optional(),
    recoveryCode: z.string().trim().min(8).max(64).optional(),
  })
  .refine((values) => Boolean(values.code) !== Boolean(values.recoveryCode), {
    message: "Indicá un código TOTP o un código de recuperación, no ambos.",
    path: ["code"],
  });

export const twoFactorReconfigureConfirmSchema = z.object({
  code: totpCodeSchema,
});


export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
