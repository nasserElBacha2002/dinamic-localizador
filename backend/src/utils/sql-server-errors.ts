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
