import { randomUUID } from "node:crypto";

/** Per-run integration database: `din_test_<uuid>`. */
export const EPHEMERAL_INTEGRATION_DB_PREFIX = "din_test_";

/** Nested billing proof databases (subset schema). */
export const EPHEMERAL_BILLING_DB_PREFIX = "din406_bce_";

const INTEGRATION_EPHEMERAL_NAME = new RegExp(
  `^${EPHEMERAL_INTEGRATION_DB_PREFIX}[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`,
  "i",
);

const BILLING_EPHEMERAL_NAME = new RegExp(`^${EPHEMERAL_BILLING_DB_PREFIX}\\d+$`);

export const generateEphemeralIntegrationDatabaseName = (): string =>
  `${EPHEMERAL_INTEGRATION_DB_PREFIX}${randomUUID()}`;

export const generateEphemeralBillingDatabaseName = (): string =>
  `${EPHEMERAL_BILLING_DB_PREFIX}${Date.now()}`;

export const isEphemeralIntegrationDatabaseName = (databaseName: string): boolean =>
  INTEGRATION_EPHEMERAL_NAME.test(databaseName.trim());

export const isEphemeralBillingDatabaseName = (databaseName: string): boolean =>
  BILLING_EPHEMERAL_NAME.test(databaseName.trim());

export const isAnyEphemeralTestDatabaseName = (databaseName: string): boolean =>
  isEphemeralIntegrationDatabaseName(databaseName) || isEphemeralBillingDatabaseName(databaseName);

export const assertEphemeralIntegrationDatabaseName = (databaseName: string): void => {
  if (!isEphemeralIntegrationDatabaseName(databaseName)) {
    throw new Error(
      `Refusing test SQL: database name must match ${EPHEMERAL_INTEGRATION_DB_PREFIX}<uuid>, got "${databaseName}".`,
    );
  }
};

export const assertEphemeralBillingDatabaseName = (databaseName: string): void => {
  if (!isEphemeralBillingDatabaseName(databaseName)) {
    throw new Error(
      `Refusing billing ephemeral SQL: database name must match ${EPHEMERAL_BILLING_DB_PREFIX}<digits>, got "${databaseName}".`,
    );
  }
};

export const assertEphemeralDatabaseNameForDrop = (databaseName: string): void => {
  if (!isAnyEphemeralTestDatabaseName(databaseName)) {
    throw new Error(
      `Refusing DROP DATABASE: "${databaseName}" is not a verified ephemeral test database name.`,
    );
  }
};