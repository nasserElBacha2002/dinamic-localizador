import sql from "mssql";
import { env } from "../config/env";

const config: sql.config = {
  server: env.DB_HOST,
  port: env.DB_PORT,
  database: env.DB_NAME,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
  options: {
    encrypt: env.DB_ENCRYPT,
    trustServerCertificate: env.DB_TRUST_SERVER_CERTIFICATE,
  },
};

let pool: sql.ConnectionPool | null = null;
let testPoolOverride: sql.ConnectionPool | null = null;

/** Test-only hook to avoid mocking module bindings in unit tests. */
export const setTestPool = (override: sql.ConnectionPool | null): void => {
  testPoolOverride = override;
};

export const connectDatabase = async (): Promise<sql.ConnectionPool> => {
  if (pool?.connected) {
    return pool;
  }

  pool = new sql.ConnectionPool(config);
  await pool.connect();
  console.log("Database connection established.");

  return pool;
};

export const closeDatabase = async (): Promise<void> => {
  if (pool) {
    await pool.close();
    pool = null;
    console.log("Database connection closed.");
  }
};

export const getPool = (): sql.ConnectionPool => {
  if (testPoolOverride) {
    return testPoolOverride;
  }

  if (!pool?.connected) {
    throw new Error("Database pool is not initialized.");
  }

  return pool;
};
