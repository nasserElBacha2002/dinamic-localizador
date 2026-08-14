#!/usr/bin/env node
/**
 * Run backend DB integration tests (requires RUN_DB_INTEGRATION_TESTS=true).
 *
 * Same discovery rules as unit tests: do not rely on shell recursive globs.
 */
import { readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const backendRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const srcRoot = join(backendRoot, "src");

const collectIntegrationTests = (dir, acc = []) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      collectIntegrationTests(path, acc);
      continue;
    }
    if (name.endsWith(".integration.test.ts")) {
      acc.push(relative(backendRoot, path));
    }
  }
  return acc;
};

const files = collectIntegrationTests(srcRoot).sort();
if (files.length === 0) {
  console.error("No integration test files found under src/");
  process.exit(1);
}

const tsxBin = join(backendRoot, "node_modules", ".bin", "tsx");
if (!existsSync(tsxBin)) {
  console.error(`tsx binary not found at ${tsxBin}. Run npm ci in backend/.`);
  process.exit(1);
}

console.log(`[run-integration-tests] running ${files.length} integration test files`);

const result = spawnSync(
  tsxBin,
  [
    "--import",
    "./src/test-helpers/preload-test-env.ts",
    "--test",
    "--test-concurrency=1",
    "--test-force-exit",
    ...files,
  ],
  {
    cwd: backendRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      EMAIL_TRANSPORT: process.env.EMAIL_TRANSPORT ?? "console",
      RUN_DB_INTEGRATION_TESTS: "true",
    },
    shell: process.platform === "win32",
  },
);

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status === null ? 1 : result.status);
