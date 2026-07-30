import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, realpathSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, beforeEach, afterEach } from "node:test";
import { resolveGoogleApplicationCredentialsPath } from "./resolve-gcp-credentials";

describe("resolveGoogleApplicationCredentialsPath", () => {
  const original = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  let tempDir = "";

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "gcs-creds-"));
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    } else {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = original;
    }
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("leaves path unchanged when file exists", () => {
    const file = join(tempDir, "key.json");
    writeFileSync(file, "{}");
    process.env.GOOGLE_APPLICATION_CREDENTIALS = file;
    resolveGoogleApplicationCredentialsPath();
    assert.equal(process.env.GOOGLE_APPLICATION_CREDENTIALS, file);
  });

  it("remaps /app/secrets/ to sibling secrets when present", () => {
    const secretsDir = join(tempDir, "secrets");
    mkdirSync(secretsDir);
    const file = join(secretsDir, "gcp-service-account.json");
    writeFileSync(file, "{}");
    const cwd = process.cwd();
    process.chdir(tempDir);
    try {
      process.env.GOOGLE_APPLICATION_CREDENTIALS =
        "/app/secrets/gcp-service-account.json";
      resolveGoogleApplicationCredentialsPath();
      assert.equal(
        realpathSync(process.env.GOOGLE_APPLICATION_CREDENTIALS!),
        realpathSync(file),
      );
    } finally {
      process.chdir(cwd);
    }
  });
});
