import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Like dinamic-gemini: map Docker `/app/secrets/...` to repo `secrets/` for local `npm run dev`.
 * Mutates process.env.GOOGLE_APPLICATION_CREDENTIALS when a host file is found.
 */
export const resolveGoogleApplicationCredentialsPath = (): void => {
  const raw = (process.env.GOOGLE_APPLICATION_CREDENTIALS ?? "").trim();
  if (!raw) {
    return;
  }
  if (existsSync(raw)) {
    return;
  }

  const candidates: string[] = [];
  if (raw.startsWith("/app/secrets/")) {
    const name = raw.slice("/app/secrets/".length);
    candidates.push(
      resolve(process.cwd(), "secrets", name),
      resolve(process.cwd(), "..", "secrets", name),
    );
  } else {
    candidates.push(
      resolve(process.cwd(), raw),
      resolve(process.cwd(), "..", raw),
    );
  }

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = candidate;
      return;
    }
  }
};
