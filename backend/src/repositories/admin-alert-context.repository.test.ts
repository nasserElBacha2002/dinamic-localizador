/**
 * Guards admin-alert context SQL against the legacy `services` table name.
 * Real FK: scheduled_operations.service_id → operational_locations (id, company_id).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const REPO_PATH = join(
  process.cwd(),
  "src/repositories/admin-alert-context.repository.ts",
);

describe("adminAlertContextRepository SQL schema guard", () => {
  it("joins operational_locations for scheduled_operations.service_id", () => {
    const source = readFileSync(REPO_PATH, "utf8");

    assert.equal(/\bJOIN\s+services\b/i.test(source), false);
    assert.equal(/\bFROM\s+services\b/i.test(source), false);
    assert.equal(/\bdbo\.services\b/i.test(source), false);

    const joins = source.match(/INNER JOIN operational_locations s/g) ?? [];
    assert.equal(
      joins.length,
      3,
      "expected three operational_locations joins (checkin candidates, unavailable, missing-checkin)",
    );
    assert.match(source, /s\.id = i\.service_id/);
    assert.match(source, /s\.name AS service_name/);
    assert.match(source, /s\.address AS service_address/);
    assert.match(source, /s\.locality AS service_locality/);
  });
});
