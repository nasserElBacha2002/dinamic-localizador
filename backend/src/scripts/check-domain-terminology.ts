/**
 * Domain terminology guard — fails when forbidden legacy tokens appear outside explicit allowlists.
 * Run: npm run check:terminology
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";

const ROOT = join(process.cwd(), "..");
const SCAN_ROOTS = [
  join(ROOT, "backend/src"),
  join(ROOT, "frontend/src"),
] as const;

const SELF_PATH = "backend/src/scripts/check-domain-terminology.ts";

const FORBIDDEN_PATTERN =
  /\b(inventory|inventories|inventario|inventarios|store|stores|tienda|tiendas)\b/i;

const FORBIDDEN_PATH_PATTERN =
  /(?:^|\/)(?:.*\/)?(?:inventory|inventories|store|stores)(?:\/|\.)/i;

/** Exact file paths (relative to repo root) allowed to contain legacy tokens. */
const ALLOWLISTED_FILES = new Set([
  "backend/src/utils/legacy-operation-session-context.ts",
  "backend/src/constants/operation-import.ts",
  "backend/src/constants/operational-tables.ts",
  "backend/src/constants/operational-tables.test.ts",
  "backend/src/database/operational-table-rename.integration.test.ts",
  "backend/src/scripts/audit-operational-rename-schema.ts",
  "frontend/src/domain/terminology.ts",
  "frontend/src/domain/terminology.test.ts",
  "frontend/src/routes/AppRoutes.tsx",
  "frontend/src/api/endpoints.test.ts",
]);

/** Per-file line patterns allowed (narrow compatibility). */
const ALLOWLISTED_LINE_PATTERNS_BY_FILE: Record<string, RegExp[]> = {
  "backend/src/types/twilio.types.ts": [/inventoryId/, /inventoryOptions/],
  "backend/src/utils/bot-session-states.ts": [/WAITING_.*OPERATION_SELECTION/],
  "backend/src/routes/api-route-aliases.test.ts": [
    /legacyRoute|legacyPath|concat\(|\/invent|\/stor/,
  ],
  "backend/src/scripts/export-database-services.ts": [/export:stores/],
  "backend/src/scripts/fix-services-from-reconciliation.ts": [/fix:stores/],
  "backend/src/services/whatsapp-router/whatsapp-router.service.test.ts": [/doesNotMatch.*inventario/],
  "backend/src/services/whatsapp-bot.service.ts": [/UX_attendance_records_inventory/],
  "frontend/src/types/operation-import.ts": [/store_format|storeFormat/],
  "frontend/src/schemas/service.schema.ts": [/storeFormat/],
  "frontend/src/types/service.ts": [/storeFormat/],
  "frontend/src/components/services/ServiceForm.tsx": [/storeFormat/],
  "frontend/src/pages/settings/company-settings-operational.test.ts": [/doesNotMatch.*Inventarios/],
  "frontend/src/design-system/filters/FilterLookupInput.tsx": [/store=\{/],
};

function collectFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "node_modules" || entry === "dist") continue;
      collectFiles(full, acc);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

function isForbiddenPath(repoRelative: string): boolean {
  if (ALLOWLISTED_FILES.has(repoRelative)) {
    return false;
  }
  const fileName = basename(repoRelative);
  if (/^(inventory|store)/i.test(fileName) || /(inventory|store)/i.test(fileName.replace(/\.[^.]+$/, ""))) {
    return true;
  }
  return FORBIDDEN_PATH_PATTERN.test(`/${repoRelative}`);
}

function isAllowlistedLine(repoRelative: string, line: string): boolean {
  if (repoRelative === SELF_PATH) {
    return true;
  }
  if (ALLOWLISTED_FILES.has(repoRelative)) {
    return true;
  }
  const patterns = ALLOWLISTED_LINE_PATTERNS_BY_FILE[repoRelative];
  if (!patterns) {
    return false;
  }
  return patterns.some((pattern) => pattern.test(line));
}

function main(): void {
  const violations: Array<{ file: string; line: number; text: string; kind: "path" | "content" }> = [];

  for (const scanRoot of SCAN_ROOTS) {
    for (const filePath of collectFiles(scanRoot)) {
      const repoRelative = relative(ROOT, filePath).replace(/\\/g, "/");

      if (isForbiddenPath(repoRelative)) {
        violations.push({
          file: repoRelative,
          line: 0,
          text: "(forbidden legacy path or filename)",
          kind: "path",
        });
        continue;
      }

      const content = readFileSync(filePath, "utf8");
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!FORBIDDEN_PATTERN.test(line)) {
          continue;
        }
        if (isAllowlistedLine(repoRelative, line)) {
          continue;
        }
        violations.push({
          file: repoRelative,
          line: i + 1,
          text: line.trim().slice(0, 160),
          kind: "content",
        });
      }
    }
  }

  if (violations.length > 0) {
    console.error(`Domain terminology guard failed: ${violations.length} violation(s)\n`);
    for (const v of violations.slice(0, 60)) {
      const location = v.line > 0 ? `${v.file}:${v.line}` : v.file;
      console.error(`  ${location}: ${v.text}`);
    }
    if (violations.length > 60) {
      console.error(`  ... and ${violations.length - 60} more`);
    }
    process.exit(1);
  }

  console.log("Domain terminology guard passed.");
}

main();
