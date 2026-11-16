import { readFileSync } from "node:fs";
import { join } from "node:path";
import sql from "mssql";
import { env } from "../config/env";
import { applySqlScriptInTransaction } from "../database/run-migrations";
import { closeDatabase, setTestPool } from "../database/connection";
import { insertSyntheticStrategicCompanies } from "./disposable-strategic-company-identities";
import {
  assertSafeIntegrationDatabaseTarget,
  INTEGRATION_DATABASE_NAME,
} from "./integration-test";

const migrationsDir =
  process.env.MIGRATIONS_DIR?.trim() || join(process.cwd(), "..", "database", "migrations");

export const EPHEMERAL_DB_PREFIX = "din406_bce_";

export type EphemeralBillingExemptionEvidence = {
  databaseName: string;
  createdAtIso: string;
  destroyedAtIso?: string;
  destroyed: boolean;
};

export type EphemeralBillingExemptionHandle = {
  pool: sql.ConnectionPool;
  evidence: EphemeralBillingExemptionEvidence;
  masterPool: sql.ConnectionPool;
};

export type CreateEphemeralBillingExemptionDatabaseOptions = {
  /** Test-only: fail during bootstrap to verify compensatory DROP DATABASE. */
  injectBootstrapFailure?: boolean;
};

const sqlConfig = (database: string): sql.config => ({
  server: env.DB_HOST,
  port: env.DB_PORT,
  database,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  options: {
    encrypt: env.DB_ENCRYPT,
    trustServerCertificate: env.DB_TRUST_SERVER_CERTIFICATE,
  },
});

const normalizeServerIdentity = (value: string): string =>
  value.trim().toLowerCase().replace(/\\/g, ",").split(",")[0] ?? "";

export const assertEphemeralDatabaseName = (databaseName: string): void => {
  if (!new RegExp(`^${EPHEMERAL_DB_PREFIX}\\d+$`).test(databaseName)) {
    throw new Error(`Refusing ephemeral billing tests: invalid database name ${databaseName}.`);
  }
  if (databaseName === INTEGRATION_DATABASE_NAME) {
    throw new Error(
      `Refusing ephemeral billing tests on shared integration database ${INTEGRATION_DATABASE_NAME}.`,
    );
  }
};

/**
 * Explicit authorization for CREATE/DROP DATABASE during billing exemption proofs.
 * Reuses integration disposable-target guards and verifies the SQL Server endpoint.
 */
export const assertEphemeralBillingExemptionTestsAllowed = async (
  masterPool: sql.ConnectionPool,
): Promise<void> => {
  assertSafeIntegrationDatabaseTarget();

  if (process.env.INTEGRATION_EPHEMERAL_BILLING_DDL_ALLOWED !== "true") {
    throw new Error(
      "Refusing ephemeral billing DDL: INTEGRATION_EPHEMERAL_BILLING_DDL_ALLOWED is not true.",
    );
  }

  const endpoint = await masterPool.request().query(`
    SELECT
      CAST(@@SERVERNAME AS NVARCHAR(256)) AS server_name,
      CAST(SERVERPROPERTY('ServerName') AS NVARCHAR(256)) AS server_fqdn,
      DB_NAME() AS connected_database
  `);
  const row = endpoint.recordset[0] as {
    server_name: string;
    server_fqdn: string | null;
    connected_database: string;
  };

  const connectedDatabase = String(row.connected_database ?? "");
  if (connectedDatabase.toLowerCase() !== "master") {
    throw new Error(
      `Refusing ephemeral billing DDL: expected master connection, got DB_NAME()=${connectedDatabase}.`,
    );
  }

  const configuredHost = normalizeServerIdentity(env.DB_HOST);
  const reportedNames = [row.server_name, row.server_fqdn ?? ""]
    .map((name) => normalizeServerIdentity(String(name)))
    .filter(Boolean);

  const explicitExpected = process.env.INTEGRATION_SQL_EXPECTED_SERVER_NAME?.trim();
  if (explicitExpected) {
    const expectedNormalized = normalizeServerIdentity(explicitExpected);
    const explicitMatches = reportedNames.some(
      (reported) => reported === expectedNormalized || reported.startsWith(`${expectedNormalized},`),
    );
    if (!explicitMatches) {
      throw new Error(
        `Refusing ephemeral billing DDL: SQL Server identity [${reportedNames.join(", ")}] does not match INTEGRATION_SQL_EXPECTED_SERVER_NAME=${explicitExpected}.`,
      );
    }
    return;
  }

  const hostMatches = reportedNames.some(
    (reported) =>
      reported === configuredHost ||
      reported.startsWith(`${configuredHost},`) ||
      configuredHost.startsWith(`${reported},`),
  );

  const loopbackConfigured =
    configuredHost === "localhost" ||
    configuredHost === "127.0.0.1" ||
    configuredHost === "." ||
    configuredHost === "(local)";

  if (!hostMatches && !loopbackConfigured) {
    throw new Error(
      `Refusing ephemeral billing DDL: SQL Server identity [${reportedNames.join(", ")}] does not match configured DB_HOST=${env.DB_HOST}. Set INTEGRATION_SQL_EXPECTED_SERVER_NAME when using a non-loopback disposable target.`,
    );
  }
};

export const assertEphemeralDatabaseAbsent = async (
  masterPool: sql.ConnectionPool,
  databaseName: string,
): Promise<void> => {
  assertEphemeralDatabaseName(databaseName);
  const result = await masterPool
    .request()
    .input("dbName", sql.NVarChar(128), databaseName)
    .query(`SELECT DB_ID(@dbName) AS db_id`);
  if (result.recordset[0]?.db_id != null) {
    throw new Error(`Ephemeral billing database still exists: ${databaseName}`);
  }
};

export const destroyEphemeralBillingDatabaseOnly = async (
  masterPool: sql.ConnectionPool,
  databaseName: string,
): Promise<void> => {
  assertEphemeralDatabaseName(databaseName);
  await masterPool.request().query(`
    IF DB_ID(N'${databaseName}') IS NOT NULL
    BEGIN
      ALTER DATABASE [${databaseName}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
      DROP DATABASE [${databaseName}];
    END;
  `);
  await assertEphemeralDatabaseAbsent(masterPool, databaseName);
};

export const bootstrapEphemeralBillingSchema = async (
  pool: sql.ConnectionPool,
  options?: { injectBootstrapFailure?: boolean },
): Promise<void> => {
  await pool.request().query(`
    CREATE TABLE dbo.system_migrations (
      migration_name NVARCHAR(255) NOT NULL
        CONSTRAINT PK_system_migrations_ephemeral PRIMARY KEY,
      applied_at DATETIME2 NOT NULL
        CONSTRAINT DF_system_migrations_ephemeral_applied DEFAULT SYSUTCDATETIME()
    );

    CREATE TABLE dbo.companies (
      id UNIQUEIDENTIFIER NOT NULL
        CONSTRAINT PK_companies_ephemeral PRIMARY KEY,
      name NVARCHAR(200) NOT NULL,
      legal_name NVARCHAR(300) NULL,
      tax_id NVARCHAR(80) NULL,
      country NVARCHAR(80) NULL,
      default_timezone NVARCHAR(80) NOT NULL,
      status NVARCHAR(30) NOT NULL
        CONSTRAINT DF_companies_ephemeral_status DEFAULT N'ACTIVE',
      created_at DATETIME2 NOT NULL
        CONSTRAINT DF_companies_ephemeral_created DEFAULT SYSUTCDATETIME(),
      updated_at DATETIME2 NOT NULL
        CONSTRAINT DF_companies_ephemeral_updated DEFAULT SYSUTCDATETIME()
    );

    CREATE TABLE dbo.users (
      id UNIQUEIDENTIFIER NOT NULL
        CONSTRAINT PK_users_ephemeral PRIMARY KEY DEFAULT NEWID(),
      name NVARCHAR(150) NOT NULL,
      email NVARCHAR(255) NOT NULL,
      password_hash NVARCHAR(255) NOT NULL,
      role NVARCHAR(30) NOT NULL,
      active BIT NOT NULL CONSTRAINT DF_users_ephemeral_active DEFAULT 1,
      created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
      updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );

    CREATE TABLE dbo.audit_logs (
      id UNIQUEIDENTIFIER NOT NULL
        CONSTRAINT PK_audit_logs_ephemeral PRIMARY KEY DEFAULT NEWID(),
      company_id UNIQUEIDENTIFIER NOT NULL,
      entity_type NVARCHAR(50) NOT NULL,
      entity_id UNIQUEIDENTIFIER NOT NULL,
      action NVARCHAR(50) NOT NULL,
      previous_data NVARCHAR(MAX) NULL,
      new_data NVARCHAR(MAX) NULL,
      reason NVARCHAR(500) NULL,
      user_id UNIQUEIDENTIFIER NULL,
      created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
  `);

  if (options?.injectBootstrapFailure) {
    throw new Error("EPHEMERAL_BOOTSTRAP_INJECTED_FAILURE");
  }

  const billingMigrationFiles = [
    "159_billing_commercial_catalog.sql",
    "160_billing_subscriptions.sql",
    "161_billing_subscriptions_contract_guards.sql",
    "162_billing_subscription_term_cancellation.sql",
    "163_billing_company_exemptions.sql",
    "164_billing_plan_public_offering.sql",
    "165_billing_subscription_term_commercial_audit.sql",
    "166_billing_admin_idempotency_digest_exemption_immutability.sql",
    "167_billing_company_exemptions_immutability_hardening.sql",
    "168_billing_subscription_term_commercial_benefit.sql",
    "169_billing_company_exemptions_immutability_complete.sql",
  ] as const;

  for (const migrationFile of billingMigrationFiles) {
    const script = readFileSync(join(migrationsDir, migrationFile), "utf8");
    await applySqlScriptInTransaction(pool, script, { registerMigrationName: migrationFile });
  }

  await insertSyntheticStrategicCompanies(pool);
};

const closePoolQuietly = async (pool: sql.ConnectionPool | null | undefined): Promise<void> => {
  if (!pool) {
    return;
  }
  try {
    await pool.close();
  } catch {
    // ignore
  }
};

const destroyWithCleanupReporting = async (
  masterPool: sql.ConnectionPool | null,
  databaseName: string,
  originalError: unknown,
  pool?: sql.ConnectionPool | null,
): Promise<never> => {
  const originalMessage =
    originalError instanceof Error ? originalError.message : String(originalError);
  let cleanupError: Error | null = null;

  await closePoolQuietly(pool);

  if (masterPool) {
    try {
      await destroyEphemeralBillingDatabaseOnly(masterPool, databaseName);
    } catch (error) {
      cleanupError = error instanceof Error ? error : new Error(String(error));
    }
    await closePoolQuietly(masterPool);
  }

  if (cleanupError) {
    throw new Error(
      `Ephemeral billing preparation failed (${originalMessage}); compensatory cleanup also failed (${cleanupError.message}).`,
      { cause: originalError },
    );
  }

  throw originalError instanceof Error
    ? originalError
    : new Error(`Ephemeral billing preparation failed: ${originalMessage}`);
};

/**
 * Creates an exclusive throwaway SQL Server database for billing exemption tests with permanent rows.
 * Requires CREATE DATABASE on the integration login.
 */
export const createEphemeralBillingExemptionDatabase = async (
  options?: CreateEphemeralBillingExemptionDatabaseOptions,
): Promise<EphemeralBillingExemptionHandle> => {
  const databaseName = `${EPHEMERAL_DB_PREFIX}${Date.now()}`;
  assertEphemeralDatabaseName(databaseName);

  let masterPool: sql.ConnectionPool | null = null;
  let pool: sql.ConnectionPool | null = null;
  let databaseCreated = false;

  const evidence: EphemeralBillingExemptionEvidence = {
    databaseName,
    createdAtIso: new Date().toISOString(),
    destroyed: false,
  };

  try {
    masterPool = new sql.ConnectionPool(sqlConfig("master"));
    await masterPool.connect();
    await assertEphemeralBillingExemptionTestsAllowed(masterPool);

    await masterPool.request().query(`CREATE DATABASE [${databaseName}]`);
    databaseCreated = true;

    pool = new sql.ConnectionPool(sqlConfig(databaseName));
    await pool.connect();

    await bootstrapEphemeralBillingSchema(pool, {
      injectBootstrapFailure: options?.injectBootstrapFailure,
    });

    const connectedDb = String(
      (await pool.request().query(`SELECT DB_NAME() AS name`)).recordset[0]?.name ?? "",
    );
    if (connectedDb !== databaseName) {
      throw new Error(
        `Ephemeral billing database identity mismatch: expected ${databaseName}, connected ${connectedDb}.`,
      );
    }

    console.log(
      `[ephemeral-billing-exemption] created database=${databaseName} at=${evidence.createdAtIso}`,
    );

    return { pool, evidence, masterPool };
  } catch (error) {
    if (databaseCreated && masterPool) {
      return destroyWithCleanupReporting(masterPool, databaseName, error, pool);
    }
    await closePoolQuietly(pool);
    await closePoolQuietly(masterPool);
    throw error;
  }
};

export const activateEphemeralBillingExemptionDatabase = async (
  handle: EphemeralBillingExemptionHandle,
): Promise<void> => {
  setTestPool(handle.pool);
};

export const destroyEphemeralBillingExemptionDatabase = async (
  handle: EphemeralBillingExemptionHandle,
): Promise<void> => {
  const { databaseName } = handle.evidence;
  assertEphemeralDatabaseName(databaseName);

  setTestPool(null);
  await closeDatabase().catch(() => {
    // Pool override may not have been opened via connectDatabase.
  });

  await closePoolQuietly(handle.pool);

  try {
    await destroyEphemeralBillingDatabaseOnly(handle.masterPool, databaseName);
    handle.evidence.destroyed = true;
    handle.evidence.destroyedAtIso = new Date().toISOString();
    console.log(
      `[ephemeral-billing-exemption] destroyed database=${databaseName} at=${handle.evidence.destroyedAtIso}`,
    );
  } finally {
    await closePoolQuietly(handle.masterPool);
  }
};