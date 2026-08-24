const RECOVERY_CODES_ONCE_KEY = "dinamic_2fa_recovery_codes_once";

export function persistRecoveryCodesOnce(codes: string[]): void {
  sessionStorage.setItem(RECOVERY_CODES_ONCE_KEY, JSON.stringify(codes));
}

export function readRecoveryCodesOnce(): string[] | null {
  const raw = sessionStorage.getItem(RECOVERY_CODES_ONCE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearRecoveryCodesOnce(): void {
  sessionStorage.removeItem(RECOVERY_CODES_ONCE_KEY);
}
