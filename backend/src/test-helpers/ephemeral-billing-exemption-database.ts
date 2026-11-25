import { readFileSync } from "node:fs";
import { join } from "node:path";
import sql from "mssql";
import { applySqlScriptInTransaction } from "../database/run-migrations";
import { closeDatabase, setTestPool } from "../database/connection";
import { insertSyntheticStrategicCompanies } from "./disposable-strategic-company-identities";
import { assertIntegrationDdlAllowed } from "./integration-test-sql-guard";
import {
  assertEphemeralBillingDatabaseName,
  EPHEMERAL_BILLING_DB_PREFIX,
  generateEphemeralBillingDatabaseName,
} from "./ephemeral-database-names";
import { destroyVerifiedEphemeralDatabase } from "./ephemeral-integration-database";
import { assertTestSqlServerEndpointAllowed } from "./test-sql-server-guard";
import { randomUUID } from "node:crypto";
import { resolveTestSqlProvisionCredentials } from "./test-sql-credentials";
import { stampEphemeralDatabaseOwnership } from "./ephemeral-database-ownership";
import { destroyProvisionedEphemeralDatabaseWithoutOwnershipStamp } from "./ephemeral-provision-cleanup";

const migrationsDir =
  process.env.MIGRATIONS_DIR?.trim() || join(process.cwd(), "..", "database", "migrations");

export const EPHEMERAL_DB_PREFIX = EPHEMERAL_BILLING_DB_PREFIX;

export type EphemeralBillingExemptionEvidence = {
  databaseName: string;
  ownershipToken: string;
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

const sqlConfig = (database: string): sql.config => {
  const credentials = resolveTestSqlProvisionCredentials();
  return {
    server: credentials.host,
    port: credentials.port,
    database,
    user: credentials.user,
    password: credentials.password,
    options: {
      encrypt: credentials.encrypt,
      trustServerCertificate: credentials.trustServerCertificate,
    },
  };
};

export const assertEphemeralDatabaseName = (databaseName: string): void => {
  assertEphemeralBillingDatabaseName(databaseName);
};

/**
 * Explicit authorization for CREATE/DROP DATABASE during billing exemption proofs.
 * Reuses integration disposable-target guards and verifies the SQL Server endpoint.
 */
export const assertEphemeralBillingExemptionTestsAllowed = async (
  masterPool: sql.ConnectionPool,
): Promise<void> => {
  assertIntegrationDdlAllowed();

  if (process.env.INTEGRATION_EPHEMERAL_BILLING_DDL_ALLOWED !== "true") {
    throw new Error(
      "Refusing ephemeral billing DDL: INTEGRATION_EPHEMERAL_BILLING_DDL_ALLOWED is not true.",
    );
  }

  const credentials = resolveTestSqlProvisionCredentials();
  await assertTestSqlServerEndpointAllowed(masterPool, credentials, { requireMasterConnection: true });
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
  authorization: { ownershipToken: string },
): Promise<void> => {
  assertEphemeralDatabaseName(databaseName);
  const credentials = resolveTestSqlProvisionCredentials();
  await destroyVerifiedEphemeralDatabase(masterPool, databaseName, credentials, {
    ownershipToken: authorization.ownershipToken,
    allowForeignSessions: true,
  });
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
  pool: sql.ConnectionPool | null | undefined,
  ownershipToken: string,
): Promise<never> => {
  const originalMessage =
    originalError instanceof Error ? originalError.message : String(originalError);
  let cleanupError: Error | null = null;

  await closePoolQuietly(pool);

  if (masterPool) {
    try {
      await destroyEphemeralBillingDatabaseOnly(masterPool, databaseName, { ownershipToken });
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
  const databaseName = generateEphemeralBillingDatabaseName();
  assertEphemeralDatabaseName(databaseName);

  let masterPool: sql.ConnectionPool | null = null;
  let pool: sql.ConnectionPool | null = null;
  let databaseCreated = false;
  let ownershipStamped = false;

  const ownershipToken = randomUUID();
  const orchestratorPid = Number(process.env.DINAMIC_INTEGRATION_ORCHESTRATOR_PID ?? process.pid);
  const evidence: EphemeralBillingExemptionEvidence = {
    databaseName,
    ownershipToken,
    createdAtIso: new Date().toISOString(),
    destroyed: false,
  };

  try {
    masterPool = new sql.ConnectionPool(sqlConfig("master"));
    await masterPool.connect();
    await assertEphemeralBillingExemptionTestsAllowed(masterPool);

    await masterPool.request().query(`CREATE DATABASE [${databaseName}]`);
    databaseCreated = true;
    evidence.createdAtIso = new Date().toISOString();

    pool = new sql.ConnectionPool(sqlConfig(databaseName));
    await pool.connect();

    await bootstrapEphemeralBillingSchema(pool, {
      injectBootstrapFailure: options?.injectBootstrapFailure,
    });
    await stampEphemeralDatabaseOwnership(pool, ownershipToken);
    ownershipStamped = true;

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
      await closePoolQuietly(pool);
      pool = null;
      if (ownershipStamped) {
        return destroyWithCleanupReporting(masterPool, databaseName, error, pool, ownershipToken);
      }
      try {
        const credentials = resolveTestSqlProvisionCredentials();
        await destroyProvisionedEphemeralDatabaseWithoutOwnershipStamp(
          masterPool,
          databaseName,
          credentials,
          {
            databaseName,
            orchestratorPid,
            createdAtIso: evidence.createdAtIso,
          },
        );
      } catch (cleanupError) {
        const originalMessage = error instanceof Error ? error.message : String(error);
        const cleanupMessage =
          cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
        throw new Error(
          `Ephemeral billing preparation failed (${originalMessage}); unstamped compensatory cleanup failed (${cleanupMessage}).`,
          { cause: error },
        );
      }
      throw error instanceof Error
        ? error
        : new Error(`Ephemeral billing preparation failed: ${String(error)}`);
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
    await destroyEphemeralBillingDatabaseOnly(handle.masterPool, databaseName, {
      ownershipToken: handle.evidence.ownershipToken,
    });
    handle.evidence.destroyed = true;
    handle.evidence.destroyedAtIso = new Date().toISOString();
    console.log(
      `[ephemeral-billing-exemption] destroyed database=${databaseName} at=${handle.evidence.destroyedAtIso}`,
    );
  } finally {
    await closePoolQuietly(handle.masterPool);
  }
};