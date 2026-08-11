/**
 * Pure helper for migration SQL identity resolution (Phases 3–4).
 * Kept free of dotenv / process.exit so unit tests can import safely.
 *
 * Modes:
 * - Shared: both DB_MIGRATION_USER and DB_MIGRATION_PASSWORD unset/whitespace → DB_USER/DB_PASSWORD
 * - Dedicated: both set (non-whitespace) → migration credentials
 * - Partial (XOR): configuration error — never silently reuse runtime password
 */
export class MigrationCredentialConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MigrationCredentialConfigError";
  }
}

const isPresent = (value: string | undefined): boolean =>
  value !== undefined && value.trim() !== "";

export const resolveMigrationDbCredentials = (input: {
  DB_USER: string;
  DB_PASSWORD: string;
  DB_MIGRATION_USER?: string;
  DB_MIGRATION_PASSWORD?: string;
}): { user: string; password: string; usesDedicatedMigrationIdentity: boolean } => {
  const hasUser = isPresent(input.DB_MIGRATION_USER);
  const hasPassword = isPresent(input.DB_MIGRATION_PASSWORD);

  if (!hasUser && !hasPassword) {
    return {
      user: input.DB_USER,
      password: input.DB_PASSWORD,
      usesDedicatedMigrationIdentity: false,
    };
  }

  if (hasUser && hasPassword) {
    return {
      user: input.DB_MIGRATION_USER!.trim(),
      password: input.DB_MIGRATION_PASSWORD!,
      usesDedicatedMigrationIdentity: true,
    };
  }

  if (hasUser && !hasPassword) {
    throw new MigrationCredentialConfigError(
      "DB_MIGRATION_USER is set but DB_MIGRATION_PASSWORD is missing or blank. Set both for dedicated migration identity, or unset both to use DB_USER/DB_PASSWORD.",
    );
  }

  throw new MigrationCredentialConfigError(
    "DB_MIGRATION_PASSWORD is set but DB_MIGRATION_USER is missing or blank. Set both for dedicated migration identity, or unset both to use DB_USER/DB_PASSWORD.",
  );
};
