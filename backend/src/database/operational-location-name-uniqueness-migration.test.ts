import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

describe("migration 049 operational location name uniqueness hardening", () => {
  const migrationSource = readFileSync(
    join(process.cwd(), "../database/migrations/049_operational_locations_name_uniqueness_hardening.sql"),
    "utf8",
  );

  it("audits duplicates with trim-compatible normalization", () => {
    assert.match(migrationSource, /LTRIM\(RTRIM\(name\)\)/);
    assert.match(migrationSource, /duplicate names exist within the same company after trimming/i);
  });

  it("drops name-only unique keys by metadata and fails if any remain", () => {
    assert.match(migrationSource, /is_unique_constraint/);
    assert.match(migrationSource, /DROP CONSTRAINT/);
    assert.match(migrationSource, /DROP INDEX/);
    assert.match(migrationSource, /global operational location name uniqueness still exists/i);
  });

  it("keeps the company-scoped unique index name used by backend error mapping", () => {
    assert.match(migrationSource, /UQ_operational_locations_company_id_name/);
    assert.match(migrationSource, /\(company_id, name\)/);
  });
});
