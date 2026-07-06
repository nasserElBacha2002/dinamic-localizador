/**
 * Domain terminology guard — fails when forbidden legacy tokens appear outside explicit allowlists.
 * Run: npm run check:terminology
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  isAllowlistedViolation,
  scanCodeLine,
  scanPackageJson,
  scanPath,
  type TerminologyViolation,
} from "./domain-terminology-scanner";

const ROOT = join(process.cwd(), "..");
const SCAN_ROOTS = [join(ROOT, "backend/src"), join(ROOT, "frontend/src")] as const;
const CONFIG_FILES = [
  "backend/package.json",
  "frontend/package.json",
] as const;

const SELF_PATHS = new Set([
  "backend/src/scripts/check-domain-terminology.ts",
  "backend/src/scripts/domain-terminology-scanner.ts",
  "backend/src/scripts/domain-terminology-scanner.test.ts",
]);

/** Exact file paths (relative to repo root) fully exempt from content scanning. */
const ALLOWLISTED_FILES = new Set([
  "backend/src/utils/legacy-operation-session-context.ts",
  "backend/src/constants/operation-import.ts",
  "backend/src/constants/operational-tables.ts",
  "backend/src/constants/operational-tables.test.ts",
  "backend/src/database/operational-table-rename.integration.test.ts",
  "backend/src/database/company-module-migration.integration.test.ts",
  "backend/src/scripts/audit-operational-rename-schema.ts",
  "frontend/src/domain/terminology.ts",
  "frontend/src/domain/terminology.test.ts",
  "frontend/src/routes/AppRoutes.tsx",
  "frontend/src/api/endpoints.test.ts",
]);

/** Per-file line patterns allowed (narrow compatibility). */
const ALLOWED_LEGACY_REFERENCES: Record<string, RegExp[]> = {
  "backend/src/utils/legacy-operation-session-context.ts": [/inventoryId/, /inventoryOptions/],
  "backend/src/constants/operation-import.ts": [/tienda/, /Tienda/],
  "backend/src/repositories/service.repository.ts": [/store_format/, /@serviceFormat/],
  "backend/src/utils/row-mappers.ts": [/store_format/],
  "backend/src/utils/bot-session-states.ts": [/WAITING_.*OPERATION_SELECTION/],
  "backend/src/constants/company-location-types.ts": [/store_format/],
  "backend/src/types/twilio.types.ts": [/inventoryId/, /inventoryOptions/],
  "backend/src/utils/bot-runtime-context.ts": [/\.getStore\(\)/],
  "backend/src/utils/bot-runtime-settings-scope.ts": [/\.getStore\(\)/],
  "backend/src/scripts/export-database-services.ts": [/store_format/],
  "backend/src/routes/api-route-aliases.test.ts": [
    /legacyRoute|legacyPath|concat\(|\/invent|\/stor/,
  ],
  "backend/src/services/whatsapp-router/whatsapp-router.service.test.ts": [/doesNotMatch.*inventario/],
  "backend/src/services/whatsapp-bot.service.ts": [/UX_attendance_records_inventory/],
  "frontend/src/pages/settings/company-settings-operational.test.ts": [/doesNotMatch.*Inventarios/, /STORE_FORMATS/],
  "frontend/src/design-system/filters/FilterLookupInput.tsx": [/store=\{/],
};

function collectFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "node_modules" || entry === "dist") {
        continue;
      }
      collectFiles(full, acc);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

function formatViolation(violation: TerminologyViolation): string {
  const location = violation.line > 0 ? `${violation.file}:${violation.line}` : violation.file;
  return `  ${location} [${violation.category}] token=${violation.matchedToken}: ${violation.text}`;
}

function shouldSkipContentScan(repoRelative: string): boolean {
  return SELF_PATHS.has(repoRelative) || ALLOWLISTED_FILES.has(repoRelative);
}

function collectViolations(): TerminologyViolation[] {
  const violations: TerminologyViolation[] = [];

  for (const scanRoot of SCAN_ROOTS) {
    for (const filePath of collectFiles(scanRoot)) {
      const repoRelative = relative(ROOT, filePath).replace(/\\/g, "/");

      const pathViolation = scanPath(repoRelative);
      if (pathViolation && !ALLOWLISTED_FILES.has(repoRelative)) {
        violations.push(pathViolation);
        continue;
      }

      if (shouldSkipContentScan(repoRelative)) {
        continue;
      }

      const content = readFileSync(filePath, "utf8");
      const lines = content.split("\n");

      for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        const lineViolations = scanCodeLine(repoRelative, index + 1, line);
        for (const violation of lineViolations) {
          if (isAllowlistedViolation(repoRelative, line, violation, ALLOWED_LEGACY_REFERENCES)) {
            continue;
          }
          violations.push(violation);
        }
      }
    }
  }

  for (const configFile of CONFIG_FILES) {
    const filePath = join(ROOT, configFile);
    const content = readFileSync(filePath, "utf8");
    const configViolations = scanPackageJson(configFile, content);
    for (const violation of configViolations) {
      if (isAllowlistedViolation(configFile, violation.text, violation, ALLOWED_LEGACY_REFERENCES)) {
        continue;
      }
      violations.push(violation);
    }
  }

  return violations;
}

export function runDomainTerminologyGuard(): TerminologyViolation[] {
  return collectViolations();
}

function main(): void {
  const violations = collectViolations();

  if (violations.length > 0) {
    console.error(`Domain terminology guard failed: ${violations.length} violation(s)\n`);
    for (const violation of violations.slice(0, 80)) {
      console.error(formatViolation(violation));
    }
    if (violations.length > 80) {
      console.error(`  ... and ${violations.length - 80} more`);
    }
    process.exit(1);
  }

  console.log("Domain terminology guard passed.");
}

if (require.main === module) {
  main();
}
