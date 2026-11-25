import { normalizeServerIdentity } from "./test-sql-server-guard";

export const assertTestSqlDisposableEnvironmentConfigured = (): void => {
  if (process.env.TEST_SQL_DISPOSABLE_ACKNOWLEDGED !== "true") {
    throw new Error(
      "Refusing test SQL: set TEST_SQL_DISPOSABLE_ACKNOWLEDGED=true only on intentionally disposable SQL Server instances.",
    );
  }

  const allowedServer = process.env.TEST_SQL_ALLOWED_SERVER_NAME?.trim();
  if (!allowedServer) {
    throw new Error(
      "Refusing test SQL: TEST_SQL_ALLOWED_SERVER_NAME is required (must match @@SERVERNAME of the disposable instance).",
    );
  }
  if (!normalizeServerIdentity(allowedServer)) {
    throw new Error("Refusing test SQL: TEST_SQL_ALLOWED_SERVER_NAME is empty after normalization.");
  }
};

export const assertTestSqlLoginAllowed = (user: string): void => {
  const normalizedUser = user.trim().toLowerCase();
  if (normalizedUser !== "sa") {
    return;
  }
  if (process.env.TEST_SQL_ALLOW_SYSTEM_ADMIN !== "true") {
    throw new Error(
      "Refusing test SQL: login 'sa' is blocked. Use a dedicated test login or set TEST_SQL_ALLOW_SYSTEM_ADMIN=true on a disposable instance only.",
    );
  }
};