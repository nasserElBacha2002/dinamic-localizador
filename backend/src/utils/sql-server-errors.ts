export const isDuplicateKeyError = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const maybeSqlError = error as { number?: number; originalError?: { number?: number } };

  return (
    maybeSqlError.number === 2601 ||
    maybeSqlError.number === 2627 ||
    maybeSqlError.originalError?.number === 2601 ||
    maybeSqlError.originalError?.number === 2627
  );
};

export const isSqlDeadlockError = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const maybeSqlError = error as { number?: number; originalError?: { number?: number } };
  return maybeSqlError.number === 1205 || maybeSqlError.originalError?.number === 1205;
};

/** Extracts SQL Server unique index / constraint name from a duplicate-key error message when present. */
export const getDuplicateKeyConstraint = (error: unknown): string | null => {
  if (!isDuplicateKeyError(error) || typeof error !== "object" || error === null) {
    return null;
  }

  const message = String(
    (error as { message?: string }).message ??
      (error as { originalError?: { message?: string } }).originalError?.message ??
      "",
  );

  const match =
    message.match(/unique index '([^']+)'/i) ??
    message.match(/constraint '([^']+)'/i) ??
    message.match(/duplicate key.*?['`]([^'`]+)['`]/i);

  return match?.[1] ?? null;
};

const duplicateKeyMessage = (error: unknown): string => {
  if (typeof error !== "object" || error === null) {
    return String(error);
  }
  return String(
    (error as { message?: string }).message ??
      (error as { originalError?: { message?: string } }).originalError?.message ??
      "",
  );
};

/**
 * True when `error` is a SQL Server duplicate-key (2601/2627) for the given
 * unique index / constraint name — exact name only (no prefix/substring).
 *
 * When the constraint name cannot be parsed, falls back to a quoted-identifier
 * search in the message (`'Name'` / `` `Name` ``) so `UQ_test` does not match
 * `UQ_test_archived`.
 */
export const matchesDuplicateKeyConstraint = (
  error: unknown,
  constraintName: string,
): boolean => {
  if (!constraintName || !isDuplicateKeyError(error)) {
    return false;
  }

  const extracted = getDuplicateKeyConstraint(error);
  if (extracted) {
    return extracted === constraintName;
  }

  const message = duplicateKeyMessage(error);
  return message.includes(`'${constraintName}'`) || message.includes(`\`${constraintName}\``);
};
