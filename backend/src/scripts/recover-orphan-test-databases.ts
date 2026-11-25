/**
 * DIN-462 — list and optionally drop verified orphan ephemeral test databases.
 * Dry-run by default; pass --execute to drop after ownership + activity checks.
 */
import { readdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import sql from "mssql";
import {
  EPHEMERAL_BILLING_DB_PREFIX,
  EPHEMERAL_INTEGRATION_DB_PREFIX,
  isAnyEphemeralTestDatabaseName,
} from "../test-helpers/ephemeral-database-names";
import { destroyVerifiedEphemeralDatabase } from "../test-helpers/ephemeral-integration-database";
import { assertTestSqlServerEndpointAllowed } from "../test-helpers/test-sql-server-guard";
import { resolveTestSqlProvisionCredentials } from "../test-helpers/test-sql-credentials";
import {
  countForeignSessionsOnDatabase,
  readEphemeralDatabaseOwnershipToken,
} from "../test-helpers/ephemeral-database-ownership";
import { maskOwnershipToken, redactOwnershipTokensInMessage } from "../test-helpers/redact-ownership-token";

const execute = process.argv.includes("--execute");
const maxAgeMinutes = Number(process.env.TEST_SQL_ORPHAN_MAX_AGE_MINUTES ?? "180");

const sqlConfig = (credentials: ReturnType<typeof resolveTestSqlProvisionCredentials>): sql.config => ({
  server: credentials.host,
  port: credentials.port,
  database: "master",
  user: credentials.user,
  password: credentials.password,
  options: {
    encrypt: credentials.encrypt,
    trustServerCertificate: credentials.trustServerCertificate,
  },
});

const activeSessionDatabaseNames = (): Set<string> => {
  const active = new Set<string>();
  for (const name of readdirSync(tmpdir())) {
    if (!name.startsWith("dinamic-integration-db-") || !name.endsWith(".json")) {
      continue;
    }
    try {
      const payload = JSON.parse(readFileSync(join(tmpdir(), name), "utf8")) as { databaseName?: string };
      if (payload.databaseName) {
        active.add(payload.databaseName);
      }
    } catch {
      // ignore unreadable session files
    }
  }
  return active;
};

const main = async (): Promise<void> => {
  if (execute && process.env.TEST_SQL_ORPHAN_RECOVERY_ACKNOWLEDGED !== "true") {
    throw new Error(
      "Refusing orphan DROP --execute: set TEST_SQL_ORPHAN_RECOVERY_ACKNOWLEDGED=true on disposable SQL only.",
    );
  }

  const credentials = resolveTestSqlProvisionCredentials();
  const masterPool = new sql.ConnectionPool(sqlConfig(credentials));
  await masterPool.connect();
  await assertTestSqlServerEndpointAllowed(masterPool, credentials, { requireMasterConnection: true });

  const activeDatabases = activeSessionDatabaseNames();

  const result = await masterPool.request().query(`
    SELECT name, create_date
    FROM sys.databases
    WHERE name LIKE '${EPHEMERAL_INTEGRATION_DB_PREFIX}%'
       OR name LIKE '${EPHEMERAL_BILLING_DB_PREFIX}%'
    ORDER BY create_date ASC
  `);

  const cutoff = Date.now() - maxAgeMinutes * 60_000;
  let candidates = 0;
  let dropped = 0;

  for (const row of result.recordset) {
    const name = String(row.name);
    if (!isAnyEphemeralTestDatabaseName(name)) {
      continue;
    }
    const createdAt = new Date(row.create_date).getTime();
    if (!Number.isFinite(createdAt) || createdAt >= cutoff) {
      continue;
    }
    if (activeDatabases.has(name)) {
      console.log(`[recover-orphan-test-databases] skip active session database=${name}`);
      continue;
    }

    const ownerToken = await readEphemeralDatabaseOwnershipToken(masterPool, name);
    if (!ownerToken) {
      console.log(`[recover-orphan-test-databases] skip database=${name} (missing ownership marker)`);
      continue;
    }

    const foreignSessions = await countForeignSessionsOnDatabase(masterPool, name);
    if (foreignSessions > 0) {
      console.log(
        `[recover-orphan-test-databases] skip database=${name} (${foreignSessions} active user session(s))`,
      );
      continue;
    }

    candidates += 1;
    console.log(
      `[recover-orphan-test-databases] candidate database=${name} created=${row.create_date} ownership=${maskOwnershipToken(ownerToken)} mode=${execute ? "DROP" : "DRY_RUN"}`,
    );

    if (execute) {
      try {
        await destroyVerifiedEphemeralDatabase(masterPool, name, credentials, {
          ownershipToken: ownerToken,
          allowForeignSessions: false,
        });
        dropped += 1;
      } catch (dropError) {
        const message =
          dropError instanceof Error
            ? redactOwnershipTokensInMessage(dropError.message)
            : redactOwnershipTokensInMessage(String(dropError));
        console.error(`[recover-orphan-test-databases] drop failed database=${name} error=${message}`);
      }
    }
  }

  if (candidates === 0) {
    console.log("[recover-orphan-test-databases] no verified orphan candidates");
  } else {
    console.log(`[recover-orphan-test-databases] candidates=${candidates} dropped=${dropped}`);
  }

  await masterPool.close();
};

void main().catch((error: unknown) => {
  const message =
    error instanceof Error ? redactOwnershipTokensInMessage(error.message) : redactOwnershipTokensInMessage(String(error));
  console.error(`recover-orphan-test-databases failed: ${message}`);
  process.exit(1);
});