#!/usr/bin/env node
/**
 * Run backend DB integration tests with ephemeral database provisioning (DIN-462).
 */
import { readdirSync, statSync, existsSync, readFileSync, createWriteStream, unlinkSync } from "node:fs";
import { join, relative } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { parseTapSummaryLine } from "./din-462-closure-gate.mjs";

const backendRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const srcRoot = join(backendRoot, "src");
const tsxBin = join(backendRoot, "node_modules", ".bin", "tsx");

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

if (!existsSync(tsxBin)) {
  console.error(`tsx binary not found at ${tsxBin}. Run npm ci in backend/.`);
  process.exit(1);
}

const orchestratorPid = process.pid;

const mapTestSqlCredentialsToRuntimeDb = (env, databaseName) => {
  if (!env.TEST_DB_HOST || !env.TEST_DB_USER || !env.TEST_DB_PASSWORD) {
    throw new Error("TEST_DB_HOST, TEST_DB_USER and TEST_DB_PASSWORD are required.");
  }
  if (!env.TEST_SQL_DISPOSABLE_ACKNOWLEDGED || env.TEST_SQL_DISPOSABLE_ACKNOWLEDGED !== "true") {
    throw new Error("TEST_SQL_DISPOSABLE_ACKNOWLEDGED=true is required.");
  }
  if (!env.TEST_SQL_ALLOWED_SERVER_NAME?.trim()) {
    throw new Error("TEST_SQL_ALLOWED_SERVER_NAME is required.");
  }
  env.DB_HOST = env.TEST_DB_HOST;
  env.DB_PORT = env.TEST_DB_PORT ?? "1433";
  env.DB_USER = env.TEST_DB_USER;
  env.DB_PASSWORD = env.TEST_DB_PASSWORD;
  env.DB_ENCRYPT = env.TEST_DB_ENCRYPT ?? "false";
  env.DB_TRUST_SERVER_CERTIFICATE = env.TEST_DB_TRUST_SERVER_CERTIFICATE ?? "true";
  const resolvedName = databaseName?.trim() || env.DINAMIC_INTEGRATION_DATABASE_NAME?.trim() || "master";
  env.DB_NAME = resolvedName;
  if (databaseName?.trim()) {
    env.DINAMIC_INTEGRATION_DATABASE_NAME = databaseName.trim();
  }
};

const integrationEnv = {
  ...process.env,
  NODE_ENV: process.env.NODE_ENV ?? "test",
  RUN_DB_INTEGRATION_TESTS: "true",
  INTEGRATION_SQL_DDL_ALLOWED: "true",
  INTEGRATION_EPHEMERAL_BILLING_DDL_ALLOWED:
    process.env.INTEGRATION_EPHEMERAL_BILLING_DDL_ALLOWED ?? "true",
  EMAIL_TRANSPORT: process.env.EMAIL_TRANSPORT ?? "console",
  ADMIN_EMAIL: process.env.ADMIN_EMAIL ?? "admin@dinamicsystems.com",
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD ?? "ci-test-password-123",
  ADMIN_NAME: process.env.ADMIN_NAME ?? "CI Platform Admin",
  DINAMIC_INTEGRATION_ORCHESTRATOR_PID: String(orchestratorPid),
};

try {
  mapTestSqlCredentialsToRuntimeDb(integrationEnv);
} catch (error) {
  console.error(error);
  process.exit(1);
}

const sessionFile = join(tmpdir(), `dinamic-integration-db-${orchestratorPid}.json`);
let sessionPayload = null;
let activeChild = null;
let testsRunning = false;
let shutdownRequested = false;
let teardownDone = false;

const runIntegrityScript = (mode) => {
  const snapshotPath = process.env.PERSISTENT_DB_INTEGRITY_SNAPSHOT_PATH?.trim();
  if (!snapshotPath || process.env.PERSISTENT_DB_INTEGRITY_ENABLED !== "true") {
    return 0;
  }
  const result = spawnSync(
    tsxBin,
    [
      "--import",
      "./src/test-helpers/integration-strip-db-env.ts",
      "src/scripts/verify-persistent-database-integrity.ts",
      mode,
    ],
    {
      cwd: backendRoot,
      env: integrationEnv,
      stdio: "inherit",
      shell: process.platform === "win32",
    },
  );
  return result.status ?? 1;
};

const runTeardown = () => {
  if (teardownDone) {
    return 0;
  }
  if (testsRunning) {
    return null;
  }

  const result = spawnSync(
    tsxBin,
    ["--import", "./src/test-helpers/integration-strip-db-env.ts", "src/scripts/teardown-integration-database.ts"],
    {
      cwd: backendRoot,
      env: {
        ...integrationEnv,
        DINAMIC_INTEGRATION_ORCHESTRATOR_PID: String(orchestratorPid),
        DINAMIC_TEST_SQL_ACTIVE: "true",
      },
      stdio: "inherit",
      shell: process.platform === "win32",
    },
  );

  teardownDone = true;
  const status = result.status ?? 1;
  if (status !== 0) {
    console.error(
      `[run-integration-tests] TEARDOWN_FAILED status=${status} database=${sessionPayload?.databaseName ?? "unknown"} session=${sessionFile}`,
    );
  } else if (sessionPayload?.databaseName) {
    console.log(`[run-integration-tests] teardown OK database=${sessionPayload.databaseName}`);
  }
  return status;
};

const isOsProcessAlive = (pid) => {
  if (!pid || !Number.isInteger(pid)) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error && typeof error === "object" && "code" in error && error.code !== "ESRCH";
  }
};

const waitForOsProcessExit = (pid, timeoutMs) =>
  new Promise((resolve) => {
    if (!pid) {
      resolve(true);
      return;
    }
    const started = Date.now();
    const tick = () => {
      if (!isOsProcessAlive(pid)) {
        resolve(true);
        return;
      }
      if (Date.now() - started >= timeoutMs) {
        resolve(false);
        return;
      }
      setTimeout(tick, 200);
    };
    tick();
  });

const childStopState = {
  killEscalationTimer: null,
};

const stopActiveTestChild = (signalLabel) => {
  if (!activeChild?.pid) {
    return;
  }
  const pid = activeChild.pid;
  console.error(`[run-integration-tests] sending SIGTERM to test child pid=${pid} (${signalLabel})`);
  try {
    activeChild.kill("SIGTERM");
  } catch {
    // ignore
  }
  if (childStopState.killEscalationTimer) {
    clearTimeout(childStopState.killEscalationTimer);
  }
  childStopState.killEscalationTimer = setTimeout(() => {
    if (!isOsProcessAlive(pid)) {
      return;
    }
    console.error(`[run-integration-tests] sending SIGKILL to test child pid=${pid}`);
    try {
      activeChild.kill("SIGKILL");
    } catch {
      // ignore
    }
    if (process.platform !== "win32") {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // ignore
      }
    }
  }, 15_000);
  childStopState.killEscalationTimer.unref?.();
};

const finalizeProcess = async (testExitCode) => {
  if (testsRunning) {
    return;
  }
  if (childStopState.killEscalationTimer) {
    clearTimeout(childStopState.killEscalationTimer);
    childStopState.killEscalationTimer = null;
  }

  const integrityAfter = runIntegrityScript("compare");
  const teardownStatus = runTeardown();
  const teardownFailed = teardownStatus !== 0 && teardownStatus !== null;

  if (teardownFailed) {
    process.exit(teardownStatus);
  }
  if (integrityAfter !== 0) {
    process.exit(integrityAfter);
  }
  process.exit(testExitCode);
};

const onSignal = (signal) => {
  shutdownRequested = true;
  console.error(`[run-integration-tests] received ${signal}, stopping tests before teardown`);
  if (activeChild?.pid) {
    stopActiveTestChild(signal);
    return;
  }
  void finalizeProcess(1);
};

process.on("SIGINT", () => onSignal("SIGINT"));
process.on("SIGTERM", () => onSignal("SIGTERM"));

const integrityBefore = runIntegrityScript("capture");
if (integrityBefore !== 0) {
  process.exit(integrityBefore);
}

const provisionResult = spawnSync(
  tsxBin,
  [
    "--import",
    "./src/test-helpers/integration-strip-db-env.ts",
    "src/scripts/provision-integration-database.ts",
  ],
  {
    cwd: backendRoot,
    env: integrationEnv,
    stdio: "inherit",
    shell: process.platform === "win32",
  },
);

if (provisionResult.error) {
  console.error(provisionResult.error);
  process.exit(1);
}
if (provisionResult.status !== 0) {
  console.error(
    `[run-integration-tests] PROVISION_FAILED status=${provisionResult.status ?? "null"}`,
  );
  process.exit(provisionResult.status ?? 1);
}

if (!existsSync(sessionFile)) {
  console.error(
    `[run-integration-tests] PROVISION_FAILED missing session file at ${sessionFile}`,
  );
  process.exit(1);
}

if (existsSync(sessionFile)) {
  sessionPayload = JSON.parse(readFileSync(sessionFile, "utf8"));
  const allowed = integrationEnv.TEST_SQL_ALLOWED_SERVER_NAME?.trim() ?? "";
  const provisioned = Array.isArray(sessionPayload?.serverNames)
    ? sessionPayload.serverNames.map((name) => String(name ?? "").trim()).filter(Boolean)
    : [];
  if (allowed && provisioned.length > 0) {
    const normalizedAllowed = allowed.toLowerCase().replace(/\\/g, ",");
    const matches = provisioned.some((name) => {
      const normalized = name.toLowerCase().replace(/\\/g, ",");
      return (
        normalized === normalizedAllowed ||
        normalized.startsWith(`${normalizedAllowed},`) ||
        normalizedAllowed.startsWith(`${normalized},`)
      );
    });
    if (!matches) {
      console.error(
        `[run-integration-tests] TEST_SQL_ALLOWED_SERVER_NAME=${allowed} does not match provisioned identity [${provisioned.join(", ")}]`,
      );
      process.exit(1);
    }
  }
}

const maskToken = (token) => {
  if (!token || typeof token !== "string") {
    return "unknown";
  }
  if (token.length <= 8) {
    return "****";
  }
  return `${token.slice(0, 4)}…${token.slice(-4)}`;
};

console.log(`[run-integration-tests] running ${files.length} integration test files`);
if (sessionPayload?.databaseName) {
  console.log(
    `[run-integration-tests] ephemeral database=${sessionPayload.databaseName} ownership=${maskToken(sessionPayload.ownershipToken)}`,
  );
}

const logPath = join(tmpdir(), `dinamic-integration-${process.pid}.log`);
const logStream = createWriteStream(logPath);

const childEnv = {
  ...integrationEnv,
  DINAMIC_TEST_SQL_ACTIVE: "true",
  DINAMIC_INTEGRATION_DATABASE_NAME: sessionPayload?.databaseName ?? "",
};
try {
  mapTestSqlCredentialsToRuntimeDb(childEnv, sessionPayload?.databaseName);
} catch (error) {
  console.error(error);
  finalizeProcess(1);
}

const child = spawn(
  tsxBin,
  [
    "--import",
    "./src/test-helpers/integration-strip-db-env.ts",
    "--import",
    "./src/test-helpers/preload-test-env.ts",
    "--test",
    "--test-concurrency=1",
    "--test-force-exit",
    ...files,
  ],
  {
    cwd: backendRoot,
    env: childEnv,
    shell: process.platform === "win32",
    stdio: ["inherit", "pipe", "pipe"],
  },
);

activeChild = child;
testsRunning = true;

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
  testsRunning = false;
  activeChild = null;
  finalizeProcess(1);
});

child.on("close", (status, signal) => {
  logStream.end(() => {
    const childPid = child.pid;
    void (async () => {
      await waitForOsProcessExit(childPid, 30_000);
      testsRunning = false;
      activeChild = null;

    let failCount = 0;
    let skipCount = 0;
    let passCount = 0;
    let testCount = 0;
    let suiteCount = 0;
    let cancelledCount = 0;
    try {
      const combined = readFileSync(logPath, "utf8");
      const summary = parseTapSummaryLine(combined);
      if (summary) {
        failCount = summary.fail ?? 0;
        skipCount = summary.skipped ?? 0;
        passCount = summary.pass ?? 0;
        testCount = summary.tests ?? 0;
      }
      const suitesMatch = [...combined.matchAll(/^# suites (\d+)\s*$/gm)].at(-1);
      const cancelledMatch = [...combined.matchAll(/^# cancelled (\d+)\s*$/gm)].at(-1);
      suiteCount = suitesMatch ? Number(suitesMatch[1]) : 0;
      cancelledCount = cancelledMatch ? Number(cancelledMatch[1]) : 0;
      unlinkSync(logPath);
    } catch {
      // ignore
    }

    console.log(
      `[run-integration-tests] discovery integration_files=${files.length}`,
    );
    console.log(
      `[run-integration-tests] tap summary tests=${testCount} suites=${suiteCount} pass=${passCount} fail=${failCount} skipped=${skipCount} cancelled=${cancelledCount}`,
    );
    if (skipCount > 0) {
      console.error("[run-integration-tests] unexpected skipped tests in integration run");
    }

    if (signal || shutdownRequested) {
      await finalizeProcess(1);
      return;
    }

    const code = status === null ? 1 : status;
    const testFailed =
      code !== 0 || failCount > 0 || skipCount > 0 || cancelledCount > 0;
    if (code === 0 && failCount > 0) {
      console.error(`[run-integration-tests] forcing fail because TAP # fail ${failCount}`);
    }
    await finalizeProcess(testFailed ? (code !== 0 ? code : 1) : 0);
    })();
  });
});