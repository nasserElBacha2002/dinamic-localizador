import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

/**
 * Root of src/services/ stays limited to transversal services and the
 * infrastructure tests that were already there. Domain services belong in
 * src/services/<domain>/. This guard reads names only.
 */
const ALLOWED_SERVICES_ROOT_FILES = new Set([
  "audit.service.ts",
  "checkin-unavailability-diagnosis.test.ts",
  "client.service.ts",
  "database-integrity-phase0a-corrections.integration.test.ts",
  "database-integrity-phase0a-h3.h4.unit.test.ts",
  "database-integrity-phase0a.integration.test.ts",
  "database-integrity-phase1.integration.test.ts",
  "database-integrity-phase2.integration.test.ts",
  "email.service.test.ts",
  "email.service.ts",
  "job-distributed-lock.integration.test.ts",
  "listo-copy-regression.test.ts",
  "lookup.service.ts",
  "migration-098.integration.test.ts",
  "operator-permissions.integration.test.ts",
  "phase3-4-sql-performance.source-structure.guard.test.ts",
  "phase3-migration-unique.integration.test.ts",
  "phase6-bot-flow-characterization.test.ts",
  "rate-limit-cleanup.service.ts",
  "rate-limit-store.integration.test.ts",
  "rate-limit-store.ts",
  "recurring-materialization-inactive-filter.test.ts",
  "replacement-request.integration.test.ts",
  "replacement-request.service.ts",
  "server-status.service.test.ts",
  "server-status.service.ts",
  "service-list-filters.integration.test.ts",
  "service-name-uniqueness.integration.test.ts",
  "services-root-allowlist.guard.test.ts",
  "statistics.service.incidents.test.ts",
  "statistics.service.ts",
  "system-log-retention.integration.test.ts",
  "system-logs.service.ts",
  "tenant-isolation.integration.test.ts",
]);

export function disallowedServicesRootNames(names: readonly string[]): string[] {
  return names.filter((name) => name.endsWith(".ts") && !ALLOWED_SERVICES_ROOT_FILES.has(name)).sort();
}

function servicesRootTypeScriptFiles(): string[] {
  return readdirSync(join(process.cwd(), "src/services"), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => entry.name);
}

describe("services root allowlist", () => {
  it("allows only transversal services and the infrastructure tests already at the root", () => {
    assert.deepEqual(disallowedServicesRootNames(servicesRootTypeScriptFiles()), []);
  });

  it("rejects a domain service placed at the root", () => {
    assert.deepEqual(disallowedServicesRootNames(["audit.service.ts", "absence-calendar.service.ts"]), [
      "absence-calendar.service.ts",
    ]);
  });
});
