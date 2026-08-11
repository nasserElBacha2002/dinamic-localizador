import { config } from "dotenv";
import { z } from "zod";
import {
  MigrationCredentialConfigError,
  resolveMigrationDbCredentials,
} from "./migration-db-credentials";

config();

const migrationEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  TZ: z.string().min(1).default("America/Argentina/Buenos_Aires"),
  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().positive().default(1433),
  DB_NAME: z.string().min(1),
  /** Runtime / shared fallback identity (historical DB_USER). */
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  /**
   * Optional dedicated migration identity (Phases 3–4).
   * Must be set as a pair with DB_MIGRATION_PASSWORD, or both omitted (shared mode).
   * Resolution + pair validation: resolveMigrationDbCredentials (single source of truth).
   */
  DB_MIGRATION_USER: z.string().optional(),
  DB_MIGRATION_PASSWORD: z.string().optional(),
  DB_ENCRYPT: z.stringbool().default(false),
  DB_TRUST_SERVER_CERTIFICATE: z.stringbool().default(true),
});

const parsed = migrationEnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid migration environment variables:");
  console.error(parsed.error.format());
  process.exit(1);
}

const raw = parsed.data;

let credentials: ReturnType<typeof resolveMigrationDbCredentials>;
try {
  credentials = resolveMigrationDbCredentials(raw);
} catch (error) {
  if (error instanceof MigrationCredentialConfigError) {
    console.error("Invalid migration environment variables:");
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}

export const migrationEnv = {
  NODE_ENV: raw.NODE_ENV,
  TZ: raw.TZ,
  DB_HOST: raw.DB_HOST,
  DB_PORT: raw.DB_PORT,
  DB_NAME: raw.DB_NAME,
  DB_USER: credentials.user,
  DB_PASSWORD: credentials.password,
  DB_ENCRYPT: raw.DB_ENCRYPT,
  DB_TRUST_SERVER_CERTIFICATE: raw.DB_TRUST_SERVER_CERTIFICATE,
  usesDedicatedMigrationIdentity: credentials.usesDedicatedMigrationIdentity,
};

export {
  MigrationCredentialConfigError,
  resolveMigrationDbCredentials,
} from "./migration-db-credentials";
