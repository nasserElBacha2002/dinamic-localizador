import { z } from "zod";
import { AppError } from "../errors/app-error";

/** Single password policy for registration, invitation accept, and future reset flows. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres`)
  .max(PASSWORD_MAX_LENGTH, `La contraseña no puede superar ${PASSWORD_MAX_LENGTH} caracteres`);

export function assertPasswordPolicy(password: string): void {
  const parsed = passwordSchema.safeParse(password);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Contraseña inválida.";
    const tooShort = password.length < PASSWORD_MIN_LENGTH;
    throw new AppError(
      400,
      tooShort ? "PASSWORD_TOO_SHORT" : "PASSWORD_INVALID",
      message,
    );
  }
}
