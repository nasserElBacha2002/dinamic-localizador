const INVITATION_TOKEN_STORAGE_KEY = "dinamic_invitation_token_v2";
/** Short-lived continuation state after stripping token from the URL (XSS surface). */
const INVITATION_TOKEN_TTL_MS = 30 * 60 * 1000;

interface StoredInvitationToken {
  token: string;
  expiresAt: number;
}

export function persistInvitationToken(token: string): void {
  const payload: StoredInvitationToken = {
    token,
    expiresAt: Date.now() + INVITATION_TOKEN_TTL_MS,
  };
  sessionStorage.setItem(INVITATION_TOKEN_STORAGE_KEY, JSON.stringify(payload));
}

export function readPersistedInvitationToken(): string | null {
  const raw = sessionStorage.getItem(INVITATION_TOKEN_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as StoredInvitationToken;
    if (
      typeof parsed.token !== "string" ||
      typeof parsed.expiresAt !== "number" ||
      parsed.expiresAt <= Date.now()
    ) {
      clearPersistedInvitationToken();
      return null;
    }
    return parsed.token;
  } catch {
    // Legacy plain-string values from earlier builds.
    if (raw.length >= 20) {
      clearPersistedInvitationToken();
      return null;
    }
    clearPersistedInvitationToken();
    return null;
  }
}

export function clearPersistedInvitationToken(): void {
  sessionStorage.removeItem(INVITATION_TOKEN_STORAGE_KEY);
  sessionStorage.removeItem("dinamic_invitation_token");
}

/** Matches backend maskEmail: first 1–2 local chars + ***@domain */
export function emailMatchesMasked(email: string, masked: string): boolean {
  const [local, domain] = email.trim().toLowerCase().split("@");
  const [maskedLocal, maskedDomain] = masked.trim().toLowerCase().split("@");
  if (!local || !domain || !maskedLocal || !maskedDomain) {
    return false;
  }
  if (domain !== maskedDomain) {
    return false;
  }

  const prefix = maskedLocal.replace(/\*+$/, "");
  const expectedPrefixLength = Math.min(2, local.length);
  return prefix.length === expectedPrefixLength && local.startsWith(prefix);
}

export function isSafeInternalPath(path: string | null): path is string {
  return Boolean(path && path.startsWith("/") && !path.startsWith("//"));
}
