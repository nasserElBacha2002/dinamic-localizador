import { validateCustomDateRange } from "../../utils/date-range";

export function validateEndAssignmentEffectiveDate(
  effectiveDate: string,
): { valid: true } | { valid: false; message: string } {
  const validation = validateCustomDateRange(effectiveDate, effectiveDate);
  if (!validation.isValid) {
    return {
      valid: false as const,
      message:
        validation.fromError ??
        validation.toError ??
        validation.rangeError ??
        "La fecha efectiva es obligatoria.",
    };
  }

  return { valid: true as const };
}

export async function submitEndAssignmentForm(
  effectiveDate: string,
  onConfirm: (effectiveDate: string) => Promise<void>,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const validation = validateEndAssignmentEffectiveDate(effectiveDate);
  if (validation.valid === false) {
    return { ok: false as const, message: validation.message };
  }

  await onConfirm(effectiveDate);
  return { ok: true };
}
