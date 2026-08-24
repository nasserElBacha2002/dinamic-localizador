const CHALLENGE_STORAGE_KEY = "dinamic_2fa_challenge";

export function persistTwoFactorChallenge(token: string): void {
  sessionStorage.setItem(CHALLENGE_STORAGE_KEY, token);
}

export function readTwoFactorChallenge(): string | null {
  const raw = sessionStorage.getItem(CHALLENGE_STORAGE_KEY);
  if (!raw || raw.trim().length === 0) {
    return null;
  }
  return raw;
}

export function clearTwoFactorChallenge(): void {
  sessionStorage.removeItem(CHALLENGE_STORAGE_KEY);
}
