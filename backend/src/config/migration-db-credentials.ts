/**
 * Pure helper for migration SQL identity resolution (Phases 3–4).
 * Kept free of dotenv / process.exit so unit tests can import safely.
 */
export const resolveMigrationDbCredentials = (input: {
  DB_USER: string;
  DB_PASSWORD: string;
  DB_MIGRATION_USER?: string;
  DB_MIGRATION_PASSWORD?: string;
}): { user: string; password: string; usesDedicatedMigrationIdentity: boolean } => {
  const dedicatedUser = input.DB_MIGRATION_USER?.trim();
  if (!dedicatedUser) {
    return {
      user: input.DB_USER,
      password: input.DB_PASSWORD,
      usesDedicatedMigrationIdentity: false,
    };
  }
  return {
    user: dedicatedUser,
    password: input.DB_MIGRATION_PASSWORD ?? input.DB_PASSWORD,
    usesDedicatedMigrationIdentity: true,
  };
};
