#!/usr/bin/env node
/**
 * Run backend unit tests only (excludes *.integration.test.ts).
 * Portable across macOS/Linux npm script shells (avoids find `!` / ARG quirks).
 */
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
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
    if (name.endsWith(".test.ts")) acc.push(path);
  }
  return acc;
};

const files = collectUnitTests(srcRoot).sort();
if (files.length === 0) {
  console.error("No unit test files found under src/");
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  [
    "--import",
    "tsx",
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
  },
);

process.exit(result.status === null ? 1 : result.status);
