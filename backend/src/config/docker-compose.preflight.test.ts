import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const CI_PLACEHOLDERS: Record<string, string> = {
  DB_PASSWORD: "ci-db-password",
  JWT_SECRET: "ci-jwt-secret-minimum-length-32-chars",
  JWT_EXPIRES_IN: "8h",
  TWO_FACTOR_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  TWO_FACTOR_CHALLENGE_SECRET: "ci-2fa-challenge-secret",
  TWILIO_ACCOUNT_SID: "AC00000000000000000000000000000000",
  TWILIO_AUTH_TOKEN: "ci-twilio-auth-token",
  TWILIO_WHATSAPP_NUMBER: "whatsapp:+10000000000",
  TWILIO_WEBHOOK_URL: "https://example.com/api/whatsapp/webhook",
  TWILIO_ARRIVAL_REMINDER_CONTENT_SID: "HX00000000000000000000000000000001",
  TWILIO_EXIT_REMINDER_CONTENT_SID: "HX00000000000000000000000000000002",
  TWILIO_TEMPLATE_NO_CHECKIN_SID: "HX00000000000000000000000000000003",
  WHATSAPP_OBSERVABILITY_PHONE_HASH_SECRET: "ci-whatsapp-phone-hash-secret",
  FRONTEND_IMAGE: "ghcr.io/example-org/dinamic-localizador/frontend:ci",
  WEBSITE_IMAGE: "ghcr.io/example-org/dinamic-localizador/website:ci",
  SMTP_PASSWORD: "ci-smtp-password",
  SMTP_USER: "noreply@dinamicoperations.com",
  SMTP_FROM: "noreply@dinamicoperations.com",
  MARKETING_DEMO_LEAD_TO: "commercial@dinamicoperations.com",
  CORS_ALLOWED_ORIGINS: "https://app.dinamicoperations.com,https://dinamicoperations.com",
  VITE_API_URL: "https://api.dinamicoperations.com/api",
  EMAIL_TRANSPORT: "smtp",
};

function resolveDockerPreflightSupport():
  | { state: "available" }
  | { state: "skipped"; reason: string } {
  const compose = spawnSync("docker", ["compose", "version"], { encoding: "utf8" });
  if (compose.error?.code === "ENOENT") {
    return { state: "skipped", reason: "docker CLI not available" };
  }
  if (compose.status !== 0 || !compose.stdout?.includes("Docker Compose")) {
    return { state: "skipped", reason: "docker compose plugin not available" };
  }
  return { state: "available" };
}

function preparePreflightEnvFile(): { envPath: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "dinamic-compose-preflight-"));
  const envPath = join(dir, ".env");
  copyFileSync(join(repoRoot, ".env.example"), envPath);

  let content = readFileSync(envPath, "utf8");
  for (const [key, value] of Object.entries(CI_PLACEHOLDERS)) {
    const pattern = new RegExp(`^${key}=.*$`, "m");
    if (pattern.test(content)) {
      content = content.replace(pattern, `${key}=${value}`);
    } else {
      content += `\n${key}=${value}\n`;
    }
  }
  content = content.replace(/^NODE_ENV=.*$/m, "NODE_ENV=production");
  content = content.replace(
    /^TWILIO_VALIDATE_SIGNATURE=.*$/m,
    "TWILIO_VALIDATE_SIGNATURE=true",
  );
  writeFileSync(envPath, content);

  return {
    envPath,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

function composeArgv(envPath: string, extraArgs: string[]): string[] {
  return [
    "compose",
    "--env-file",
    envPath,
    "-f",
    join(repoRoot, "docker-compose.yml"),
    "-f",
    join(repoRoot, "docker-compose.prod.yml"),
    ...extraArgs,
  ];
}

/** Compose interpolation must come only from the temp env file, not backend unit-test defaults. */
function composeProcessEnv(): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH ?? "",
    HOME: process.env.HOME,
    USER: process.env.USER,
    TMPDIR: process.env.TMPDIR,
  };
}

function runCompose(envPath: string, extraArgs: string[]) {
  return spawnSync("docker", composeArgv(envPath, extraArgs), {
    encoding: "utf8",
    cwd: repoRoot,
    env: composeProcessEnv(),
  });
}

type JsonEnvironment = Record<string, string | number | null | undefined>;

function backendEnvironmentFromComposeJson(stdout: string): JsonEnvironment {
  const parsed = JSON.parse(stdout) as {
    services?: { backend?: { environment?: JsonEnvironment | string[] } };
  };
  const raw = parsed.services?.backend?.environment;
  if (!raw) {
    return {};
  }
  if (Array.isArray(raw)) {
    const env: JsonEnvironment = {};
    for (const entry of raw) {
      const text = String(entry);
      const idx = text.indexOf("=");
      if (idx <= 0) continue;
      env[text.slice(0, idx)] = text.slice(idx + 1);
    }
    return env;
  }
  return raw;
}

function dockerPreflightSkipReason(): string | false {
  const support = resolveDockerPreflightSupport();
  return support.state === "skipped" ? support.reason : false;
}

describe("docker compose preflight (DIN-472 marketing)", () => {
  it(
    "validates merged compose (quiet) and marketing/SMTP keys without logging secrets",
    { skip: dockerPreflightSkipReason() },
    () => {
      const { envPath, cleanup } = preparePreflightEnvFile();
      try {
        const quiet = runCompose(envPath, ["config", "--quiet"]);
        assert.equal(
          quiet.status,
          0,
          `docker compose config --quiet failed: ${quiet.stderr?.slice(0, 400)}`,
        );

        const structured = runCompose(envPath, ["config", "--format", "json"]);
        assert.equal(
          structured.status,
          0,
          `docker compose config --format json failed: ${structured.stderr?.slice(0, 400)}`,
        );

        const backendEnv = backendEnvironmentFromComposeJson(structured.stdout);
        assert.equal(backendEnv.SMTP_HOST, "smtp.hostinger.com");
        assert.equal(backendEnv.MARKETING_DEMO_LEAD_TO, "commercial@dinamicoperations.com");
        assert.ok(String(backendEnv.CORS_ALLOWED_ORIGINS ?? "").includes("dinamicoperations.com"));
        assert.ok(backendEnv.MARKETING_DEMO_DEDUP_WINDOW_MINUTES != null);

        const services = runCompose(envPath, ["config", "--services"]);
        assert.equal(services.status, 0);
        assert.ok(services.stdout.includes("website"));
        assert.ok(services.stdout.includes("backend"));
      } finally {
        cleanup();
      }
    },
  );
});