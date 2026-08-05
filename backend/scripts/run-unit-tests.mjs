#!/usr/bin/env node
/**
 * Run backend unit tests (excludes integration suites).
 *
 * Important: do not rely on shell recursive globs for test discovery.
 * macOS npm/sh expands star-star like star (shallow), while Linux CI dash
 * passes the glob literally to tsx (recursive) — causing local/CI mismatch.
 */
import { readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const backendRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const srcRoot = join(backendRoot, "src");

const collectUnitTests = (dir, acc = []) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      collectUnitTests(path, acc);
      continue;
    }
    if (name.endsWith(".integration.test.ts")) continue;
    if (name.endsWith(".test.ts")) {
      acc.push(relative(backendRoot, path));
    }
  }
  return acc;
};

const files = collectUnitTests(srcRoot).sort();
if (files.length === 0) {
  console.error("No unit test files found under src/");
  process.exit(1);
}

const tsxBin = join(backendRoot, "node_modules", ".bin", "tsx");
if (!existsSync(tsxBin)) {
  console.error(`tsx binary not found at ${tsxBin}. Run npm ci in backend/.`);
  process.exit(1);
}

console.log(`[run-unit-tests] running ${files.length} unit test files`);

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
    env: process.env,
    shell: process.platform === "win32",
  },
);

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status === null ? 1 : result.status);
