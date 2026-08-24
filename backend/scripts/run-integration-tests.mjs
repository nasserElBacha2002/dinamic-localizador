#!/usr/bin/env node
/**
 * Run backend DB integration tests (requires RUN_DB_INTEGRATION_TESTS=true).
 *
 * Same discovery rules as unit tests: do not rely on shell recursive globs.
 */
import { readdirSync, statSync, existsSync, createWriteStream, readFileSync, unlinkSync } from "node:fs";
import { join, relative } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

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

const logPath = join(tmpdir(), `dinamic-integration-${process.pid}.log`);
const logStream = createWriteStream(logPath);

const child = spawn(
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
    env: {
      ...process.env,
      EMAIL_TRANSPORT: process.env.EMAIL_TRANSPORT ?? "console",
      RUN_DB_INTEGRATION_TESTS: "true",
    },
    shell: process.platform === "win32",
    stdio: ["inherit", "pipe", "pipe"],
  },
);

child.stdout.on("data", (chunk) => {
  process.stdout.write(chunk);
  logStream.write(chunk);
});
child.stderr.on("data", (chunk) => {
  process.stderr.write(chunk);
  logStream.write(chunk);
});

child.on("error", (error) => {
  console.error(error);
  logStream.end();
  process.exit(1);
});

child.on("close", (status, signal) => {
  logStream.end(() => {
    let failCount = 0;
    try {
      const combined = readFileSync(logPath, "utf8");
      const failMatch = combined.match(/^# fail (\d+)\s*$/m);
      failCount = failMatch ? Number(failMatch[1]) : 0;
      unlinkSync(logPath);
    } catch {
      // ignore log cleanup / parse errors
    }

    if (signal) {
      process.exit(1);
    }
    const code = status === null ? 1 : status;
    // --test-force-exit can report exit 0 even when TAP "# fail" > 0.
    if (code !== 0 || failCount > 0) {
      if (code === 0 && failCount > 0) {
        console.error(
          `[run-integration-tests] forcing exit 1 because TAP reported # fail ${failCount}`,
        );
      }
      process.exit(code !== 0 ? code : 1);
    }
    process.exit(0);
  });
});
