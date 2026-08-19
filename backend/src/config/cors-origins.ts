/**
 * CORS allowlist from FRONTEND_URL + CORS_ALLOWED_ORIGINS.
 * In non-production, localhost and 127.0.0.1 are treated as the same host
 * so Vite on :8084 works whether the tab is localhost or 127.0.0.1.
 */
export function parseCorsOrigins(
  nodeEnv: "development" | "test" | "production",
  frontendUrl: string,
  corsAllowedOrigins?: string,
): string[] {
  const origins = new Set<string>();

  const add = (raw: string): void => {
    const trimmed = raw.trim();
    if (!trimmed) {
      return;
    }
    origins.add(trimTrailingSlash(trimmed));
    if (nodeEnv !== "production") {
      const alias = loopbackAlias(trimmed);
      if (alias) {
        origins.add(alias);
      }
    }
  };

  if (nodeEnv === "production") {
    if (corsAllowedOrigins) {
      for (const origin of corsAllowedOrigins.split(",")) {
        add(origin);
      }
    } else {
      add(frontendUrl);
    }
  } else {
    add(frontendUrl);
    if (corsAllowedOrigins) {
      for (const origin of corsAllowedOrigins.split(",")) {
        add(origin);
      }
    }
  }

  return Array.from(origins);
}

function trimTrailingSlash(origin: string): string {
  return origin.replace(/\/+$/, "");
}

function loopbackAlias(origin: string): string | null {
  try {
    const url = new URL(origin);
    if (url.hostname === "localhost") {
      url.hostname = "127.0.0.1";
      return url.origin;
    }
    if (url.hostname === "127.0.0.1") {
      url.hostname = "localhost";
      return url.origin;
    }
    return null;
  } catch {
    return null;
  }
}
