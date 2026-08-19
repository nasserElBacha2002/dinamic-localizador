const RESET_TOKEN_STORAGE_KEY = "dinamic_password_reset_token_v1";

export function persistPasswordResetToken(token: string): void {
  sessionStorage.setItem(RESET_TOKEN_STORAGE_KEY, token);
}

export function readPersistedPasswordResetToken(): string | null {
  const raw = sessionStorage.getItem(RESET_TOKEN_STORAGE_KEY);
  if (!raw || raw.trim().length === 0) {
    return null;
  }
  return raw;
}

export function clearPersistedPasswordResetToken(): void {
  sessionStorage.removeItem(RESET_TOKEN_STORAGE_KEY);
}
