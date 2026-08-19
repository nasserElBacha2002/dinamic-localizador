export const hashPassword = async (password: string): Promise<string> => {
  const bcrypt = await import("bcrypt");
  return bcrypt.hash(password, 12);
};

export const verifyPassword = async (password: string, passwordHash: string): Promise<boolean> => {
  const bcrypt = await import("bcrypt");
  return bcrypt.compare(password, passwordHash);
};

/**
 * Precomputed bcrypt (cost 12) of a sentinel that is never a real credential.
 * Used so missing-user login still pays compare cost (timing-safe enumeration).
 */
export const DUMMY_PASSWORD_HASH =
  "$2b$12$LARyEQzPkoTX2yN4clilKOG1XPmoxaK4CkjHHuDML544n2AB3kHtS";

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();
