/**
 * Guards admin-alert context SQL against the legacy `services` table name.
 * Functional coverage of operational_locations joins lives in the integration suite.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const REPO_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "admin-alert-context.repository.ts",
);

describe("adminAlertContextRepository SQL schema guard", () => {
  it("does not reference the legacy services table in SQL", () => {
    const source = readFileSync(REPO_PATH, "utf8");

    assert.equal(/\bFROM\s+services\b/i.test(source), false);
    assert.equal(/\bJOIN\s+services\b/i.test(source), false);
    assert.equal(/\bdbo\.services\b/i.test(source), false);
  });
});
