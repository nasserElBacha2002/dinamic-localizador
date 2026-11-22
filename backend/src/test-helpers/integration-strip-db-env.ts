/** DIN-462 — strip application DB_* before dotenv / env.ts can bind habitual credentials. */
const keys = ["DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD"] as const;

const stripApplicationDbEnv = (): void => {
  for (const key of keys) {
    delete process.env[key];
  }
};

const reinstallEphemeralDbEnvFromTestCredentials = (): void => {
  if (process.env.RUN_DB_INTEGRATION_TESTS !== "true") {
    return;
  }
  if (process.env.DINAMIC_TEST_SQL_ACTIVE !== "true") {
    return;
  }
  const host = process.env.TEST_DB_HOST?.trim();
  const port = process.env.TEST_DB_PORT?.trim();
  const user = process.env.TEST_DB_USER?.trim();
  const password = process.env.TEST_DB_PASSWORD?.trim();
  if (!host || !port || !user || !password) {
    return;
  }
  process.env.DB_HOST = host;
  process.env.DB_PORT = port;
  process.env.DB_USER = user;
  process.env.DB_PASSWORD = password;
  const databaseName = process.env.DINAMIC_INTEGRATION_DATABASE_NAME?.trim();
  if (databaseName) {
    process.env.DB_NAME = databaseName;
  }
  if (process.env.TEST_DB_ENCRYPT !== undefined) {
    process.env.DB_ENCRYPT = process.env.TEST_DB_ENCRYPT;
  }
  if (process.env.TEST_DB_TRUST_SERVER_CERTIFICATE !== undefined) {
    process.env.DB_TRUST_SERVER_CERTIFICATE = process.env.TEST_DB_TRUST_SERVER_CERTIFICATE;
  }
};

stripApplicationDbEnv();
reinstallEphemeralDbEnvFromTestCredentials();